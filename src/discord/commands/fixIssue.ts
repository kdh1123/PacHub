import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Octokit } from '@octokit/rest';
import type { AiProvider } from '../../ai/provider.js';
import { analyzeIssue } from '../../analysis/issue/issueAnalysisService.js';
import { FixTaskStore } from '../../fix/taskStore.js';
import { assessFix } from '../../fix/policy.js';
import { workBranch, type FixTask } from '../../fix/types.js';
import type { SettingsStore } from '../../database/settingsStore.js';
import { authorize } from '../../security/authorization.js';
import { resolveRepositoryInput } from '../repositoryContext.js';
import { numberedRepositoryInputSchema } from '../../github/input.js';
const safe = { parse: [] as [] };
export function createFixIssueCommand(
  client: Octokit | undefined,
  ai: AiProvider | undefined,
  settings: SettingsStore,
  tasks: FixTaskStore,
) {
  return {
    data: new SlashCommandBuilder()
      .setName('fix-issue')
      .setDescription('승인 후 격리된 작업 브랜치에서 이슈 수정 PR을 준비합니다.')
      .addIntegerOption((o) =>
        o.setName('number').setDescription('이슈 번호').setRequired(true).setMinValue(1),
      )
      .addStringOption((o) => o.setName('owner').setDescription('소유자 또는 조직'))
      .addStringOption((o) => o.setName('repository').setDescription('저장소 이름'))
      .addBooleanOption((o) => o.setName('use-ai').setDescription('AI 분석 사용'))
      .addStringOption((o) => o.setName('base-branch').setDescription('기준 브랜치'))
      .addBooleanOption((o) => o.setName('dry-run').setDescription('분석 및 계획만 표시')),
    async execute(i: ChatInputCommandInteraction): Promise<void> {
      await i.deferReply({ ephemeral: true });
      try {
        if (!client) throw new Error('GITHUB_NOT_CONFIGURED');
        if (!authorize(i, settings, 'ADMIN').allowed) throw new Error('FIX_DENIED');
        const input = numberedRepositoryInputSchema.parse({
          ...resolveRepositoryInput(i, settings),
          number: i.options.getInteger('number', true),
        });
        const analysis = await analyzeIssue(
          client,
          input,
          ai,
          i.options.getBoolean('use-ai') === true,
        );
        const policy = assessFix(analysis);
        const id = crypto.randomUUID();
        const baseBranch =
          i.options.getString('base-branch') ??
          settings.getConfig(i.guildId!)?.defaultBranch ??
          'main';
        const dryRun = i.options.getBoolean('dry-run') === true;
        const task: FixTask = {
          id,
          guildId: i.guildId!,
          channelId: i.channelId,
          requestedByUserId: i.user.id,
          owner: input.owner,
          repository: input.repository,
          issueNumber: input.number,
          issueTitle: analysis.title,
          baseBranch,
          workBranch: workBranch(input.number, analysis.title, id),
          useAi: i.options.getBoolean('use-ai') === true,
          dryRun,
          status: dryRun ? 'COMPLETED' : 'WAITING_APPROVAL',
          plannedFiles: policy.allowedFiles,
          riskLevel: policy.risk,
          eligibility: policy.eligibility,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          updatedAt: new Date().toISOString(),
        };
        tasks.create(task);
        settings.audit({
          operationId: id,
          guildId: task.guildId,
          actorUserId: i.user.id,
          action: dryRun ? 'FIX_DRY_RUN' : 'FIX_APPROVAL_REQUESTED',
          target: `${input.owner}/${input.repository}#${input.number}`,
          success: true,
          metadata: JSON.stringify({
            eligibility: policy.eligibility,
            risk: policy.risk,
            files: task.plannedFiles.length,
          }),
        });
        const embed = new EmbedBuilder()
          .setTitle(`수정 계획: #${input.number}`)
          .setDescription(
            dryRun
              ? 'Dry run: 저장소 clone·수정·branch·push·PR 생성은 수행하지 않았습니다.'
              : '아래 계획은 ADMIN의 첫 번째 승인 전에는 실행되지 않습니다.',
          )
          .addFields(
            { name: '작업 ID', value: id, inline: true },
            { name: '예상 브랜치', value: task.workBranch, inline: true },
            { name: '위험/허용', value: `${policy.risk} / ${policy.eligibility}`, inline: true },
            { name: '예상 파일', value: task.plannedFiles.join('\n') || '없음' },
            { name: '차단 사유', value: policy.reasons.join('\n') || '없음' },
          );
        const components =
          !dryRun && policy.eligibility !== 'BLOCKED'
            ? [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`fix-approve:${id}`)
                    .setLabel('작업 승인')
                    .setStyle(ButtonStyle.Danger),
                  new ButtonBuilder()
                    .setCustomId(`fix-reject:${id}`)
                    .setLabel('작업 거절')
                    .setStyle(ButtonStyle.Secondary),
                ),
              ]
            : [];
        await i.editReply({ embeds: [embed], components, allowedMentions: safe });
      } catch (error) {
        const message =
          error instanceof Error && error.message === 'FIX_DENIED'
            ? '이 명령을 실행할 권한이 없습니다. 필요 권한: ADMIN'
            : error instanceof Error && error.message === 'PULL_REQUEST_NOT_ISSUE'
              ? '요청한 번호는 Pull Request입니다. /review를 사용해 주세요.'
              : '수정 계획을 준비하지 못했습니다. 입력값과 GitHub 접근 권한을 확인해 주세요.';
        await i.editReply({ content: message, allowedMentions: safe });
      }
    },
  };
}
