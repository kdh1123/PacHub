import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Octokit } from '@octokit/rest';
import type { AiProvider } from '../../ai/provider.js';
import { analyzeIssue } from '../../analysis/issue/issueAnalysisService.js';
import type { IssueAnalysisResult } from '../../analysis/issue/types.js';
import type { SettingsStore } from '../../database/settingsStore.js';
import { numberedRepositoryInputSchema } from '../../github/input.js';
import { toGitHubUserMessage } from '../../github/errors.js';
import { authorize } from '../../security/authorization.js';
import { resolveRepositoryInput } from '../repositoryContext.js';

const SAFE_MENTIONS = { parse: [] as [] };
const safe = (value: string, max = 900) =>
  value
    .replace(/@/g, '@\u200b')
    .replace(/```[\s\S]*?```/g, '[코드 블록]')
    .slice(0, max) || '없음';
const list = (values: string[], max = 5) =>
  values
    .slice(0, max)
    .map((value) => `• ${safe(value, 250)}`)
    .join('\n') || '없음';
function embeds(result: IssueAnalysisResult): EmbedBuilder[] {
  const output = [
    new EmbedBuilder()
      .setColor(0x2563eb)
      .setTitle(`#${result.issueNumber} ${safe(result.title, 200)}`)
      .setURL(result.url)
      .setDescription('읽기 전용 분석 제안입니다. 실제 수정 또는 재현 결과가 아닙니다.')
      .addFields(
        { name: '저장소', value: result.repository, inline: true },
        { name: '상태', value: result.state, inline: true },
        { name: '유형(추정)', value: result.issueTypes.join(', '), inline: true },
        {
          name: '분석',
          value: `댓글 ${result.commentsAnalyzed}/${result.totalComments} · 파일 ${result.relatedFiles.length} · PR ${result.relatedPullRequests.length}`,
          inline: true,
        },
        {
          name: 'AI 보조',
          value: result.aiUsed ? '사용됨' : result.aiFailed ? '실패(규칙 기반 제공)' : '사용 안 함',
          inline: true,
        },
        { name: '제한', value: result.limitations.length ? list(result.limitations, 3) : '없음' },
      ),
    new EmbedBuilder()
      .setColor(0x24292f)
      .setTitle('확인된 사실 및 재현 단서')
      .addFields(
        { name: '확인된 정보', value: list(result.confirmedFacts) },
        { name: '재현 절차', value: list(result.reproductionSteps) },
        { name: '기대 결과', value: safe(result.expectedBehavior ?? '') },
        { name: '실제 결과', value: safe(result.actualBehavior ?? '') },
      ),
    new EmbedBuilder()
      .setColor(0x24292f)
      .setTitle('관련 파일 및 원인 후보')
      .addFields(
        {
          name: '관련 파일 후보',
          value:
            result.relatedFiles
              .slice(0, 5)
              .map(
                (file) =>
                  `• [${file.relevance}] ${safe(file.path, 200)} — ${safe(file.reasons.join(', '), 300)}`,
              )
              .join('\n') || '관련 파일 확인 필요',
        },
        {
          name: '원인 후보',
          value:
            result.causeCandidates
              .slice(0, 5)
              .map(
                (cause) =>
                  `• [${cause.confidence}] ${safe(cause.title, 150)}\n${safe(cause.description, 250)}`,
              )
              .join('\n') || '근거가 부족하여 원인을 제안할 수 없습니다.',
        },
      ),
    new EmbedBuilder()
      .setColor(0x16a34a)
      .setTitle('권장 수정 및 검증 계획')
      .addFields(
        {
          name: '수정 계획',
          value:
            result.fixPlan
              .slice(0, 5)
              .map(
                (step) =>
                  `${step.order}. ${safe(step.title, 160)} — ${safe(step.description, 280)}`,
              )
              .join('\n') || '관련 파일 확인 후 최소 수정안을 결정하세요.',
        },
        { name: '테스트 계획', value: list(result.tests) },
        { name: '추가 정보', value: list(result.additionalQuestions) },
      ),
  ];
  if (result.aiSummary)
    output.push(
      new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle('AI 보조 분석')
        .setDescription(safe(result.aiSummary, 1_500))
        .setFooter({ text: 'AI 결과는 검증되지 않은 보조 의견입니다.' }),
    );
  return output;
}
export function createAnalyzeIssueCommand(
  client: Octokit | undefined,
  aiProvider: AiProvider | undefined,
  store: SettingsStore,
) {
  return {
    data: new SlashCommandBuilder()
      .setName('analyze-issue')
      .setDescription('GitHub 이슈의 원인 후보와 수정 계획을 읽기 전용으로 제안합니다.')
      .addIntegerOption((o) =>
        o.setName('number').setDescription('이슈 번호').setRequired(true).setMinValue(1),
      )
      .addStringOption((o) => o.setName('owner').setDescription('소유자 또는 조직'))
      .addStringOption((o) => o.setName('repository').setDescription('저장소 이름'))
      .addBooleanOption((o) => o.setName('use-ai').setDescription('AI 보조 분석 사용')),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      await interaction.deferReply({ ephemeral: true });
      try {
        if (!client) throw new Error('GITHUB_NOT_CONFIGURED');
        const authorization = authorize(interaction, store, 'REVIEWER');
        if (!authorization.allowed) throw new Error('ANALYZE_ISSUE_DENIED');
        const input = numberedRepositoryInputSchema.parse({
          ...resolveRepositoryInput(interaction, store),
          number: interaction.options.getInteger('number', true),
        });
        const result = await analyzeIssue(
          client,
          input,
          aiProvider,
          interaction.options.getBoolean('use-ai') === true,
        );
        store.audit({
          operationId: crypto.randomUUID(),
          guildId: interaction.guildId!,
          actorUserId: interaction.user.id,
          action: 'ISSUE_ANALYZED',
          target: `${input.owner}/${input.repository}#${input.number}`,
          success: true,
          metadata: JSON.stringify({
            comments: result.commentsAnalyzed,
            files: result.relatedFiles.length,
            prs: result.relatedPullRequests.length,
            aiUsed: result.aiUsed,
            partial: result.partialAnalysis,
          }),
        });
        await interaction.editReply({ embeds: embeds(result), allowedMentions: SAFE_MENTIONS });
      } catch (error) {
        const message =
          error instanceof Error && error.message === 'PULL_REQUEST_NOT_ISSUE'
            ? '요청한 번호는 이슈가 아니라 Pull Request입니다. /review 명령어를 사용해 주세요.'
            : error instanceof Error && error.message === 'ANALYZE_ISSUE_DENIED'
              ? '이 명령을 실행할 권한이 없습니다. 필요 권한: REVIEWER'
              : error instanceof Error && error.message === 'REPOSITORY_PAIR_REQUIRED'
                ? 'owner와 repository는 함께 입력해야 합니다.'
                : error instanceof Error &&
                    (error.message === 'DEFAULT_REPOSITORY_UNAVAILABLE' ||
                      error.message === 'DEFAULT_REPOSITORY_NOT_CONFIGURED')
                  ? '현재 Discord 서버에 기본 GitHub 저장소가 연결되어 있지 않습니다. 서버 관리자에게 /github-connect 설정을 요청해 주세요.'
                  : error instanceof Error && error.message === 'GITHUB_NOT_CONFIGURED'
                    ? 'GitHub 조회가 설정되지 않았습니다.'
                    : toGitHubUserMessage(error);
        if (interaction.guildId)
          store.audit({
            operationId: crypto.randomUUID(),
            guildId: interaction.guildId,
            actorUserId: interaction.user.id,
            action: 'ISSUE_ANALYSIS_FAILED',
            target: 'issue',
            success: false,
            metadata: JSON.stringify({
              category: error instanceof Error ? error.message : 'unknown',
            }),
          });
        await interaction.editReply({
          content: message,
          embeds: [],
          allowedMentions: SAFE_MENTIONS,
        });
      }
    },
  };
}
