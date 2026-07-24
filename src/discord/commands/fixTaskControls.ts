import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { FixTaskStore } from '../../fix/taskStore.js';
import type { FixTaskWorker } from '../../fix/types.js';
import type { SettingsStore } from '../../database/settingsStore.js';
import { authorize } from '../../security/authorization.js';

const safe = { parse: [] as [] };
const labels: Record<string, string> = {
  WAITING_APPROVAL: '1차 승인 대기',
  RUNNING_CHECKS: '검증 실행 중',
  WAITING_SECOND_APPROVAL: 'Draft PR 승인 대기',
  PUSHING: '작업 브랜치 push 중',
  COMPLETED: 'Draft PR 생성 완료',
  FAILED: '작업 실패',
  CANCELLED: '취소됨',
};
export function createFixTaskControls(
  tasks: FixTaskStore,
  worker: FixTaskWorker,
  settings: SettingsStore,
) {
  return {
    status: {
      data: new SlashCommandBuilder()
        .setName('fix-status')
        .setDescription('Fix 작업 상태를 조회합니다.')
        .addStringOption((o) => o.setName('task-id').setDescription('작업 UUID').setRequired(true)),
      async execute(i: ChatInputCommandInteraction): Promise<void> {
        const task = tasks.get(i.options.getString('task-id', true));
        const admin = authorize(i, settings, 'ADMIN').allowed;
        if (
          !task ||
          task.guildId !== i.guildId ||
          (!admin && task.requestedByUserId !== i.user.id)
        ) {
          await i.reply({
            content: '작업을 조회할 권한이 없거나 작업을 찾을 수 없습니다.',
            ephemeral: true,
            allowedMentions: safe,
          });
          return;
        }
        const validations = task.validationResults?.every((result) => result.success)
          ? '통과'
          : task.validationResults?.length
            ? '실패 또는 미완료'
            : '미실행';
        await i.reply({
          ephemeral: true,
          allowedMentions: safe,
          embeds: [
            new EmbedBuilder().setTitle(`Fix 작업 ${task.id}`).addFields(
              { name: '상태', value: labels[task.status] ?? task.status, inline: true },
              {
                name: '저장소 / 이슈',
                value: `${task.owner}/${task.repository} #${task.issueNumber}`,
                inline: true,
              },
              { name: '브랜치', value: `${task.baseBranch} → ${task.workBranch}` },
              {
                name: '변경 / 검증',
                value: `${task.changedFiles?.length ?? 0}개 / ${validations}`,
                inline: true,
              },
              {
                name: '커밋 / PR',
                value: `${task.commitSha?.slice(0, 7) ?? '없음'} / ${task.pullRequestUrl ?? '없음'}`,
                inline: true,
              },
              {
                name: '오류 / 정리',
                value: `${task.errorCode ?? '없음'} / ${task.cleanupStatus ?? '대기'}`,
              },
            ),
          ],
        });
      },
    },
    cancel: {
      data: new SlashCommandBuilder()
        .setName('fix-cancel')
        .setDescription('취소 가능한 Fix 작업을 취소합니다.')
        .addStringOption((o) => o.setName('task-id').setDescription('작업 UUID').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('취소 사유')),
      async execute(i: ChatInputCommandInteraction): Promise<void> {
        const task = tasks.get(i.options.getString('task-id', true));
        if (!task || task.guildId !== i.guildId || !authorize(i, settings, 'ADMIN').allowed) {
          await i.reply({
            content: '작업을 취소할 ADMIN 권한이 없거나 작업을 찾을 수 없습니다.',
            ephemeral: true,
            allowedMentions: safe,
          });
          return;
        }
        const cancellable = new Set([
          'WAITING_APPROVAL',
          'APPROVED',
          'PREPARING_WORKSPACE',
          'CLONING',
          'CHECKING_OUT_BASE',
          'CREATING_BRANCH',
          'GENERATING_PATCH',
          'APPLYING_PATCH',
          'VALIDATING_SCOPE',
          'RUNNING_CHECKS',
          'ANALYZING_DIFF',
          'WAITING_SECOND_APPROVAL',
        ]);
        if (!cancellable.has(task.status)) {
          await i.reply({
            content: '현재 단계에서는 작업을 취소할 수 없습니다.',
            ephemeral: true,
            allowedMentions: safe,
          });
          return;
        }
        tasks.update(task.id, { cancelReason: i.options.getString('reason')?.slice(0, 500) });
        await worker.cancelTask(task.id);
        settings.audit({
          operationId: task.id,
          guildId: task.guildId,
          actorUserId: i.user.id,
          action: 'FIX_CANCELLED',
          target: `${task.owner}/${task.repository}#${task.issueNumber}`,
          success: true,
          metadata: JSON.stringify({ reason: Boolean(i.options.getString('reason')) }),
        });
        await i.reply({
          content: '작업을 취소했고, 원격 변경 없이 작업 공간 정리를 요청했습니다.',
          ephemeral: true,
          allowedMentions: safe,
        });
      },
    },
  };
}
