import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Octokit } from '@octokit/rest';
import { repositoryInputSchema } from '../../github/input.js';
import { SettingsStore, type PermissionLevel } from '../../database/settingsStore.js';
import { authorize } from '../../security/authorization.js';

const levels: PermissionLevel[] = ['VIEWER', 'REVIEWER', 'ADMIN'];
const safe = { parse: [] as [] };
const operationId = () => crypto.randomUUID();
function denied(
  i: ChatInputCommandInteraction,
  store: SettingsStore,
  required: PermissionLevel,
): Promise<unknown> {
  const result = authorize(i, store, required);
  if (i.guildId)
    store.audit({
      operationId: operationId(),
      guildId: i.guildId,
      actorUserId: i.user.id,
      action: 'AUTHORIZATION_DENIED',
      target: i.commandName,
      success: false,
      metadata: JSON.stringify({ required, actual: result.actualLevel ?? null }),
    });
  return i.reply({
    content: `이 명령을 실행할 권한이 없습니다. 필요 권한: ${required}${result.actualLevel ? `, 현재 권한: ${result.actualLevel}` : ''}`,
    ephemeral: true,
    allowedMentions: safe,
  });
}
function isAdmin(i: ChatInputCommandInteraction, store: SettingsStore): boolean {
  return Boolean(i.guildId && authorize(i, store, 'ADMIN').allowed);
}
function isViewer(i: ChatInputCommandInteraction, store: SettingsStore): boolean {
  return Boolean(i.guildId && authorize(i, store, 'VIEWER').allowed);
}

export function createSettingsCommands(store: SettingsStore, github?: Octokit) {
  const connect = {
    data: new SlashCommandBuilder()
      .setName('github-connect')
      .setDescription('이 서버의 기본 GitHub 저장소를 연결합니다.')
      .addStringOption((o) => o.setName('owner').setDescription('소유자').setRequired(true))
      .addStringOption((o) => o.setName('repository').setDescription('저장소').setRequired(true))
      .addBooleanOption((o) => o.setName('confirm-replace').setDescription('기존 연결 교체 확인')),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      if (!isAdmin(i, store)) {
        await denied(i, store, 'ADMIN');
        return;
      }
      if (!github) {
        await i.reply({
          content: 'GitHub 인증이 설정되지 않았습니다.',
          ephemeral: true,
          allowedMentions: safe,
        });
        return;
      }
      const operation = operationId();
      try {
        const input = repositoryInputSchema.parse({
          owner: i.options.getString('owner', true),
          repository: i.options.getString('repository', true),
        });
        const existing = store.getConfig(i.guildId!);
        if (existing && !i.options.getBoolean('confirm-replace')) {
          await i.reply({
            content:
              '이미 연결된 저장소가 있습니다. 교체하려면 confirm-replace:true로 다시 실행하세요.',
            ephemeral: true,
            allowedMentions: safe,
          });
          return;
        }
        await i.deferReply({ ephemeral: true });
        const { data } = await github.rest.repos.get({
          owner: input.owner,
          repo: input.repository,
        });
        const now = new Date().toISOString();
        store.saveConfig({
          guildId: i.guildId!,
          owner: input.owner,
          repository: input.repository,
          fullName: data.full_name,
          repositoryId: data.id,
          defaultBranch: data.default_branch,
          visibility: data.private ? 'private' : 'public',
          connectedByUserId: i.user.id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        store.audit({
          operationId: operation,
          guildId: i.guildId!,
          actorUserId: i.user.id,
          action: existing ? 'REPOSITORY_REPLACED' : 'REPOSITORY_CONNECTED',
          target: data.full_name,
          success: true,
          metadata: JSON.stringify({
            previous: existing?.fullName ?? null,
            visibility: data.private ? 'private' : 'public',
          }),
        });
        await i.editReply({
          content: `GitHub 저장소 연결 완료: **${data.full_name}**\n기본 브랜치: ${data.default_branch}\n공개 여부: ${data.private ? 'Private' : 'Public'}`,
          allowedMentions: safe,
        });
      } catch (error) {
        store.audit({
          operationId: operation,
          guildId: i.guildId!,
          actorUserId: i.user.id,
          action: 'REPOSITORY_CONNECT_FAILED',
          target: 'repository',
          success: false,
          metadata: JSON.stringify({ category: error instanceof Error ? error.name : 'unknown' }),
        });
        if (i.deferred)
          await i.editReply({
            content:
              '저장소 연결에 실패했습니다. 소유자·저장소 이름과 GitHub 접근 권한을 확인해 주세요.',
            allowedMentions: safe,
          });
        else
          await i.reply({
            content: '저장소 연결에 실패했습니다. 입력값을 확인해 주세요.',
            ephemeral: true,
            allowedMentions: safe,
          });
      }
    },
  };
  const disconnect = {
    data: new SlashCommandBuilder()
      .setName('github-disconnect')
      .setDescription('기본 GitHub 저장소 연결을 해제합니다.')
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('연결 해제 확인').setRequired(true),
      ),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      if (!isAdmin(i, store)) {
        await denied(i, store, 'ADMIN');
        return;
      }
      if (!i.options.getBoolean('confirm')) {
        await i.reply({
          content: '연결 해제는 confirm:true로 확인해야 합니다.',
          ephemeral: true,
          allowedMentions: safe,
        });
        return;
      }
      if (!store.deleteConfig(i.guildId!)) {
        await i.reply({
          content: '연결된 저장소가 없습니다.',
          ephemeral: true,
          allowedMentions: safe,
        });
        return;
      }
      store.audit({
        operationId: operationId(),
        guildId: i.guildId!,
        actorUserId: i.user.id,
        action: 'REPOSITORY_DISCONNECTED',
        target: 'repository',
        success: true,
        metadata: null,
      });
      await i.reply({
        content: '저장소 연결을 해제했습니다. 역할 설정은 유지됩니다.',
        ephemeral: true,
        allowedMentions: safe,
      });
    },
  };
  const config = {
    data: new SlashCommandBuilder()
      .setName('github-config')
      .setDescription('현재 서버의 GitHub 연결 설정을 표시합니다.'),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      if (!isViewer(i, store)) {
        await denied(i, store, 'VIEWER');
        return;
      }
      const c = store.getConfig(i.guildId!);
      const roles = store.roles(i.guildId!);
      await i.reply({
        embeds: [
          new EmbedBuilder().setTitle('GitHub 서버 설정').addFields(
            { name: '저장소', value: c?.fullName ?? '연결되지 않음' },
            { name: '공개 여부', value: c ? c.visibility : '없음', inline: true },
            { name: '기본 브랜치', value: c?.defaultBranch ?? '없음', inline: true },
            { name: 'GitHub 인증', value: github ? '설정됨' : '설정되지 않음', inline: true },
            { name: 'AI 리뷰', value: '서버 환경 설정에 따름', inline: true },
            {
              name: '역할',
              value:
                roles.map((r) => `${r.roleId}: ${r.permissionLevel}`).join('\n') ||
                '등록된 역할 없음',
            },
          ),
        ],
        ephemeral: true,
        allowedMentions: safe,
      });
    },
  };
  const roleAdd = {
    data: new SlashCommandBuilder()
      .setName('github-role-add')
      .setDescription('봇 권한 역할을 추가 또는 갱신합니다.')
      .addRoleOption((o) => o.setName('role').setDescription('Discord 역할').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('permission')
          .setDescription('권한')
          .setRequired(true)
          .addChoices(...levels.map((v) => ({ name: v, value: v }))),
      ),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      if (!isAdmin(i, store)) {
        await denied(i, store, 'ADMIN');
        return;
      }
      const role = i.options.getRole('role', true);
      const permission = i.options.getString('permission', true) as PermissionLevel;
      if (role.id === i.guildId || role.managed) {
        await i.reply({
          content:
            '이 서버의 일반 역할만 등록할 수 있습니다. @everyone 및 통합 관리 역할은 허용되지 않습니다.',
          ephemeral: true,
          allowedMentions: safe,
        });
        return;
      }
      const before = store.getRole(i.guildId!, role.id);
      store.upsertRole({
        guildId: i.guildId!,
        roleId: role.id,
        permissionLevel: permission,
        createdByUserId: i.user.id,
        createdAt: before?.createdAt ?? new Date().toISOString(),
      });
      store.audit({
        operationId: operationId(),
        guildId: i.guildId!,
        actorUserId: i.user.id,
        action: before ? 'ROLE_PERMISSION_CHANGED' : 'ROLE_PERMISSION_ADDED',
        target: role.id,
        success: true,
        metadata: JSON.stringify({ before: before?.permissionLevel ?? null, after: permission }),
      });
      await i.reply({
        content: `역할 권한을 ${permission}(으)로 저장했습니다.`,
        ephemeral: true,
        allowedMentions: safe,
      });
    },
  };
  const roleRemove = {
    data: new SlashCommandBuilder()
      .setName('github-role-remove')
      .setDescription('봇 권한 역할을 제거합니다.')
      .addRoleOption((o) => o.setName('role').setDescription('Discord 역할').setRequired(true)),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      if (!isAdmin(i, store)) {
        await denied(i, store, 'ADMIN');
        return;
      }
      const role = i.options.getRole('role', true);
      if (!store.removeRole(i.guildId!, role.id)) {
        await i.reply({
          content: '현재 서버에 등록된 역할이 아닙니다.',
          ephemeral: true,
          allowedMentions: safe,
        });
        return;
      }
      store.audit({
        operationId: operationId(),
        guildId: i.guildId!,
        actorUserId: i.user.id,
        action: 'ROLE_PERMISSION_REMOVED',
        target: role.id,
        success: true,
        metadata: null,
      });
      await i.reply({
        content:
          '역할 권한을 제거했습니다. 서버 소유자와 Discord Administrator는 계속 ADMIN입니다.',
        ephemeral: true,
        allowedMentions: safe,
      });
    },
  };
  const roles = {
    data: new SlashCommandBuilder()
      .setName('github-roles')
      .setDescription('등록된 봇 권한 역할을 표시합니다.'),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      if (!isViewer(i, store)) {
        await denied(i, store, 'VIEWER');
        return;
      }
      const rows = store.roles(i.guildId!);
      await i.reply({
        content:
          rows
            .map(
              (r) =>
                `${r.roleId} — ${r.permissionLevel} · <t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>`,
            )
            .join('\n') || '등록된 역할이 없습니다.',
        ephemeral: true,
        allowedMentions: safe,
      });
    },
  };
  return { connect, disconnect, config, roleAdd, roleRemove, roles };
}
