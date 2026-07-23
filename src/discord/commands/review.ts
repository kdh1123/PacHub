import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Octokit } from '@octokit/rest';
import type { AiProvider } from '../../ai/provider.js';
import { ZodError } from 'zod';

import { toGitHubUserMessage } from '../../github/errors.js';
import { numberedRepositoryInputSchema } from '../../github/input.js';
import { reviewPullRequest } from '../../review/reviewService.js';
import type { PullRequestReviewResult, ReviewFinding } from '../../review/types.js';

const SAFE_MENTIONS = { parse: [] as [] };
const MAX_FINDINGS_TO_DISPLAY = 6;

function safeText(value: string): string {
  return value.replace(/@/g, '@\u200b').slice(0, 1_000);
}

function formatFinding(finding: ReviewFinding): string {
  const location = finding.line
    ? `${safeText(finding.file)}:${finding.line}`
    : safeText(finding.file);
  return `**[${finding.severity}] ${safeText(finding.title)}**\n${location} · ${safeText(finding.description)}\n권장: ${safeText(finding.recommendation)}`;
}

function createEmbeds(result: PullRequestReviewResult): EmbedBuilder[] {
  const summary = new EmbedBuilder()
    .setColor(
      result.riskLevel === 'CRITICAL'
        ? 0xdc2626
        : result.riskLevel === 'HIGH'
          ? 0xea580c
          : result.riskLevel === 'MEDIUM'
            ? 0xd97706
            : 0x16a34a,
    )
    .setTitle(`#${result.pullRequestNumber} ${safeText(result.title)}`)
    .setURL(result.htmlUrl)
    .setDescription('규칙 기반 휴리스틱 분석입니다. 실제 문제 여부는 사람이 검토해야 합니다.')
    .addFields(
      { name: '전체 위험도', value: result.riskLevel, inline: true },
      { name: '변경 성격(추정)', value: result.changeTypes.join(', '), inline: true },
      { name: '테스트 변경', value: result.testsChanged ? '있음' : '없음', inline: true },
      { name: '브랜치', value: `${safeText(result.headBranch)} → ${safeText(result.baseBranch)}` },
      {
        name: '변경량',
        value: `${result.totalFiles}개 파일 · +${result.additions} / -${result.deletions}`,
        inline: true,
      },
      {
        name: '분석',
        value: `${result.analyzedFiles}개 분석 · ${result.excludedFiles}개 제외${result.partialAnalysis ? ' · 일부 분석' : ''}`,
        inline: true,
      },
    );
  const findings = result.findings.sort(
    (a, b) =>
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].indexOf(a.severity) -
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].indexOf(b.severity),
  );
  if (findings.length === 0)
    return [
      summary.addFields({
        name: '중요 탐지 결과',
        value: '규칙 기반 위험 패턴이 탐지되지 않았습니다.',
      }),
    ];
  const details = new EmbedBuilder()
    .setColor(0x24292f)
    .setTitle('중요 탐지 결과')
    .setDescription(findings.slice(0, MAX_FINDINGS_TO_DISPLAY).map(formatFinding).join('\n\n'));
  if (findings.length > MAX_FINDINGS_TO_DISPLAY)
    details.setFooter({
      text: `외 ${findings.length - MAX_FINDINGS_TO_DISPLAY}건은 표시하지 않았습니다.`,
    });
  return [summary, details];
}

export function createReviewCommand(client: Octokit | undefined, aiProvider?: AiProvider) {
  return {
    data: new SlashCommandBuilder()
      .setName('review')
      .setDescription('Pull Request 변경사항을 규칙 기반으로 요약합니다.')
      .addStringOption((option) =>
        option.setName('owner').setDescription('소유자 또는 조직').setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('repository').setDescription('저장소 이름').setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName('pr-number')
          .setDescription('Pull Request 번호')
          .setRequired(true)
          .setMinValue(1),
      ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      await interaction.deferReply({ ephemeral: true });
      try {
        if (!client) throw new Error('GITHUB_NOT_CONFIGURED');
        const input = numberedRepositoryInputSchema.parse({
          owner: interaction.options.getString('owner', true),
          repository: interaction.options.getString('repository', true),
          number: interaction.options.getInteger('pr-number', true),
        });
        const result = await reviewPullRequest(client, input, aiProvider);
        const embeds = createEmbeds(result);
        if (result.aiReview) {
          embeds.push(
            new EmbedBuilder()
              .setColor(0x7c3aed)
              .setTitle('AI 리뷰 요약')
              .setDescription(safeText(result.aiReview.summary))
              .addFields(
                { name: 'AI 위험도', value: result.aiReview.risk, inline: true },
                {
                  name: '주요 우려',
                  value:
                    result.aiReview.concerns
                      .slice(0, 3)
                      .map((concern) => `[${concern.severity}] ${safeText(concern.title)}`)
                      .join('\n') || '없음',
                },
              ),
          );
        }
        await interaction.editReply({
          embeds,
          allowedMentions: SAFE_MENTIONS,
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message === 'GITHUB_NOT_CONFIGURED'
            ? 'GitHub 조회가 설정되지 않았습니다. 서버 관리자에게 `GITHUB_TOKEN` 설정을 요청해 주세요.'
            : error instanceof ZodError
              ? `입력값이 올바르지 않습니다: ${error.issues[0]?.message ?? '형식을 확인해 주세요.'}`
              : toGitHubUserMessage(error);
        await interaction.editReply({
          content: message,
          embeds: [],
          allowedMentions: SAFE_MENTIONS,
        });
      }
    },
  };
}
