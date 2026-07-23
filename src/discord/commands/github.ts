import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Octokit } from '@octokit/rest';
import { ZodError } from 'zod';

import { getIssue } from '../../github/issues.js';
import { numberedRepositoryInputSchema } from '../../github/input.js';
import { getPullRequest } from '../../github/pullRequests.js';
import { getRepository } from '../../github/repositories.js';
import { toGitHubUserMessage } from '../../github/errors.js';
import type { SettingsStore } from '../../database/settingsStore.js';
import { authorize } from '../../security/authorization.js';
import { requiresConfiguredAccess, resolveRepositoryInput } from '../repositoryContext.js';

const EMBED_COLOR = 0x24292f;
const maxFieldLength = 1_024;

function shortened(value: string | null | undefined, fallback = '없음'): string {
  if (!value) return fallback;
  const safeValue = value
    .replace(/```[\s\S]*?```/g, '[코드 블록 생략]')
    .replace(/<@&?\d+>|@everyone|@here/g, (mention) => mention.replace('@', '@\u200b'))
    .replace(/\s+/g, ' ')
    .trim();
  return safeValue.length <= maxFieldLength
    ? safeValue
    : `${safeValue.slice(0, maxFieldLength - 1)}…`;
}

function gitHubErrorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return `입력값이 올바르지 않습니다: ${error.issues[0]?.message ?? '형식을 확인해 주세요.'}`;
  if (error instanceof Error && error.message === 'PULL_REQUEST_NOT_ISSUE')
    return '요청한 번호는 이슈가 아니라 Pull Request입니다. /pr 명령어를 사용해 주세요.';
  if (error instanceof Error && error.message === 'REPOSITORY_PAIR_REQUIRED')
    return 'owner와 repository는 함께 입력해야 합니다.';
  if (
    error instanceof Error &&
    (error.message === 'DEFAULT_REPOSITORY_UNAVAILABLE' ||
      error.message === 'DEFAULT_REPOSITORY_NOT_CONFIGURED')
  )
    return '현재 Discord 서버에 기본 GitHub 저장소가 연결되어 있지 않습니다. 서버 관리자에게 /github-connect 설정을 요청해 주세요.';
  if (error instanceof Error && error.message === 'PERMISSION_DENIED')
    return `이 명령을 실행할 권한이 없습니다. 필요 권한: VIEWER${'actual' in error && error.actual ? `, 현재 권한: ${String(error.actual)}` : ''}`;
  return toGitHubUserMessage(error);
}

function clientOrReply(client: Octokit | undefined): Octokit {
  if (!client) throw new Error('GITHUB_NOT_CONFIGURED');
  return client;
}

async function respondWithError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error && error.message === 'GITHUB_NOT_CONFIGURED'
      ? 'GitHub 조회가 설정되지 않았습니다. 서버 관리자에게 `GITHUB_TOKEN` 설정을 요청해 주세요.'
      : gitHubErrorMessage(error);
  await interaction.editReply({ content: message, embeds: [], allowedMentions: { parse: [] } });
}

export function createGitHubCommands(client: Octokit | undefined, store?: SettingsStore) {
  return {
    repo: {
      data: new SlashCommandBuilder()
        .setName('repo')
        .setDescription('GitHub 저장소 정보를 조회합니다.')
        .addStringOption((option) =>
          option.setName('owner').setDescription('소유자 또는 조직').setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('repository').setDescription('저장소 이름').setRequired(false),
        ),
      async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        try {
          if (requiresConfiguredAccess(interaction, store)) {
            const result = store && authorize(interaction, store, 'VIEWER');
            if (!result?.allowed)
              throw Object.assign(new Error('PERMISSION_DENIED'), { actual: result?.actualLevel });
          }
          const input = resolveRepositoryInput(interaction, store);
          const repository = await getRepository(clientOrReply(client), input);
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(repository.full_name)
            .setURL(repository.html_url)
            .setDescription(shortened(repository.description, '설명 없음'))
            .addFields(
              { name: '공개 여부', value: repository.private ? '비공개' : '공개', inline: true },
              { name: '기본 브랜치', value: repository.default_branch, inline: true },
              { name: '주 언어', value: repository.language ?? '확인되지 않음', inline: true },
              { name: '열린 이슈', value: String(repository.open_issues_count), inline: true },
              { name: 'Fork', value: repository.fork ? '예' : '아니요', inline: true },
              { name: 'Archived', value: repository.archived ? '예' : '아니요', inline: true },
              { name: 'Stars', value: String(repository.stargazers_count), inline: true },
              { name: 'Fork 수', value: String(repository.forks_count), inline: true },
              {
                name: '생성',
                value: `<t:${Math.floor(new Date(repository.created_at).getTime() / 1000)}:R>`,
                inline: true,
              },
              {
                name: '마지막 업데이트',
                value: `<t:${Math.floor(new Date(repository.updated_at).getTime() / 1000)}:R>`,
                inline: true,
              },
            );
          await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (error) {
          await respondWithError(interaction, error);
        }
      },
    },
    issue: {
      data: new SlashCommandBuilder()
        .setName('issue')
        .setDescription('GitHub 이슈를 조회합니다.')
        .addStringOption((option) =>
          option.setName('owner').setDescription('소유자 또는 조직').setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('repository').setDescription('저장소 이름').setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName('number').setDescription('이슈 번호').setRequired(true).setMinValue(1),
        ),
      async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        try {
          if (requiresConfiguredAccess(interaction, store)) {
            const result = store && authorize(interaction, store, 'VIEWER');
            if (!result?.allowed)
              throw Object.assign(new Error('PERMISSION_DENIED'), { actual: result?.actualLevel });
          }
          const input = numberedRepositoryInputSchema.parse({
            ...resolveRepositoryInput(interaction, store),
            number: interaction.options.getInteger('number', true),
          });
          const issue = await getIssue(clientOrReply(client), input);
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`#${issue.number} ${issue.title}`)
            .setURL(issue.html_url)
            .setDescription(shortened(issue.body, '본문 없음'))
            .addFields(
              { name: '상태', value: issue.state, inline: true },
              { name: '작성자', value: issue.user?.login ?? '알 수 없음', inline: true },
              {
                name: '담당자',
                value: issue.assignees?.map((assignee) => assignee.login).join(', ') || '없음',
                inline: true,
              },
              {
                name: '라벨',
                value:
                  issue.labels
                    .map((label) => (typeof label === 'string' ? label : label.name))
                    .filter(Boolean)
                    .join(', ') || '없음',
              },
              { name: 'Milestone', value: issue.milestone?.title ?? '없음', inline: true },
              { name: '댓글', value: String(issue.comments), inline: true },
              {
                name: '생성',
                value: `<t:${Math.floor(new Date(issue.created_at).getTime() / 1000)}:R>`,
                inline: true,
              },
              {
                name: '수정',
                value: `<t:${Math.floor(new Date(issue.updated_at).getTime() / 1000)}:R>`,
                inline: true,
              },
              {
                name: '종료',
                value: issue.closed_at
                  ? `<t:${Math.floor(new Date(issue.closed_at).getTime() / 1000)}:R>`
                  : '미종료',
                inline: true,
              },
            );
          await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (error) {
          await respondWithError(interaction, error);
        }
      },
    },
    pr: {
      data: new SlashCommandBuilder()
        .setName('pr')
        .setDescription('GitHub Pull Request를 조회합니다.')
        .addStringOption((option) =>
          option.setName('owner').setDescription('소유자 또는 조직').setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('repository').setDescription('저장소 이름').setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName('number').setDescription('PR 번호').setRequired(true).setMinValue(1),
        ),
      async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        try {
          if (requiresConfiguredAccess(interaction, store)) {
            const result = store && authorize(interaction, store, 'VIEWER');
            if (!result?.allowed)
              throw Object.assign(new Error('PERMISSION_DENIED'), { actual: result?.actualLevel });
          }
          const input = numberedRepositoryInputSchema.parse({
            ...resolveRepositoryInput(interaction, store),
            number: interaction.options.getInteger('number', true),
          });
          const { pullRequest, ciState } = await getPullRequest(clientOrReply(client), input);
          const reviewState = pullRequest.merged
            ? '병합됨'
            : pullRequest.draft
              ? '초안'
              : pullRequest.requested_reviewers?.length
                ? '리뷰 요청됨'
                : '리뷰 대기';
          const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`#${pullRequest.number} ${pullRequest.title}`)
            .setURL(pullRequest.html_url)
            .setDescription(shortened(pullRequest.body, '본문 없음'))
            .addFields(
              { name: '상태', value: pullRequest.state, inline: true },
              { name: '작성자', value: pullRequest.user?.login ?? '알 수 없음', inline: true },
              { name: '리뷰', value: reviewState, inline: true },
              { name: '대상 브랜치', value: pullRequest.base.ref, inline: true },
              { name: '작업 브랜치', value: pullRequest.head.ref, inline: true },
              {
                name: '병합 가능',
                value:
                  pullRequest.mergeable === null
                    ? 'GitHub에서 계산 중'
                    : pullRequest.mergeable
                      ? '가능'
                      : '불가',
                inline: true,
              },
              { name: '병합 완료', value: pullRequest.merged ? '예' : '아니요', inline: true },
              { name: 'CI', value: ciState, inline: true },
              { name: '변경 파일', value: String(pullRequest.changed_files), inline: true },
              { name: '추가', value: `+${pullRequest.additions}`, inline: true },
              { name: '삭제', value: `-${pullRequest.deletions}`, inline: true },
              { name: 'Commit', value: String(pullRequest.commits), inline: true },
              { name: '댓글', value: String(pullRequest.comments), inline: true },
              { name: '리뷰 댓글', value: String(pullRequest.review_comments), inline: true },
              {
                name: '요청된 리뷰어',
                value:
                  pullRequest.requested_reviewers?.map((reviewer) => reviewer.login).join(', ') ||
                  '없음',
              },
              { name: '최신 Commit', value: `\`${pullRequest.head.sha.slice(0, 12)}\`` },
              {
                name: '생성',
                value: `<t:${Math.floor(new Date(pullRequest.created_at).getTime() / 1000)}:R>`,
                inline: true,
              },
              {
                name: '수정',
                value: `<t:${Math.floor(new Date(pullRequest.updated_at).getTime() / 1000)}:R>`,
                inline: true,
              },
            );
          await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (error) {
          await respondWithError(interaction, error);
        }
      },
    },
  };
}
