import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type pino from 'pino';

import { pingCommand } from './commands/ping.js';
import { createGitHubCommands } from './commands/github.js';
import { createReviewCommand } from './commands/review.js';
import type { Octokit } from '@octokit/rest';
import type { AiProvider } from '../ai/provider.js';
import type { SettingsStore } from '../database/settingsStore.js';
import { createSettingsCommands } from './commands/githubSettings.js';
import { createAnalyzeIssueCommand } from './commands/analyzeIssue.js';
import { createFixIssueCommand } from './commands/fixIssue.js';
import type { FixTaskStore } from '../fix/taskStore.js';
import { authorize } from '../security/authorization.js';
import type { FixTaskWorker } from '../fix/types.js';

export function registerInteractionHandler(
  client: Client,
  options: {
    environment: string;
    logger: pino.Logger;
    githubClient?: Octokit;
    aiProvider?: AiProvider;
    settingsStore: SettingsStore;
    fixTaskStore: FixTaskStore;
    fixWorker: FixTaskWorker;
  },
): void {
  const githubCommands = createGitHubCommands(options.githubClient, options.settingsStore);
  const reviewCommand = createReviewCommand(
    options.githubClient,
    options.aiProvider,
    options.settingsStore,
  );
  const settingsCommands = createSettingsCommands(options.settingsStore, options.githubClient);
  const analyzeIssueCommand = createAnalyzeIssueCommand(
    options.githubClient,
    options.aiProvider,
    options.settingsStore,
  );
  const fixIssueCommand = createFixIssueCommand(
    options.githubClient,
    options.aiProvider,
    options.settingsStore,
    options.fixTaskStore,
  );
  const githubCommandNames = new Set([
    githubCommands.repo.data.name,
    githubCommands.issue.data.name,
    githubCommands.pr.data.name,
    reviewCommand.data.name,
    analyzeIssueCommand.data.name,
    fixIssueCommand.data.name,
  ]);
  const cooldownUntilByUser = new Map<string, number>();
  const commands = new Map<string, (interaction: ChatInputCommandInteraction) => Promise<void>>([
    [pingCommand.data.name, (interaction) => pingCommand.execute(interaction, options.environment)],
    [githubCommands.repo.data.name, (interaction) => githubCommands.repo.execute(interaction)],
    [githubCommands.issue.data.name, (interaction) => githubCommands.issue.execute(interaction)],
    [githubCommands.pr.data.name, (interaction) => githubCommands.pr.execute(interaction)],
    [reviewCommand.data.name, (interaction) => reviewCommand.execute(interaction)],
    [analyzeIssueCommand.data.name, (interaction) => analyzeIssueCommand.execute(interaction)],
    [fixIssueCommand.data.name, (interaction) => fixIssueCommand.execute(interaction)],
    [
      settingsCommands.connect.data.name,
      (interaction) => settingsCommands.connect.execute(interaction),
    ],
    [
      settingsCommands.disconnect.data.name,
      (interaction) => settingsCommands.disconnect.execute(interaction),
    ],
    [
      settingsCommands.config.data.name,
      (interaction) => settingsCommands.config.execute(interaction),
    ],
    [
      settingsCommands.roleAdd.data.name,
      (interaction) => settingsCommands.roleAdd.execute(interaction),
    ],
    [
      settingsCommands.roleRemove.data.name,
      (interaction) => settingsCommands.roleRemove.execute(interaction),
    ],
    [
      settingsCommands.roles.data.name,
      (interaction) => settingsCommands.roles.execute(interaction),
    ],
  ]);
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('fix-')) {
      const [, taskId] = interaction.customId.split(':');
      const task = taskId && options.fixTaskStore.get(taskId);
      if (!task || interaction.guildId !== task.guildId) {
        await interaction.reply({
          content: '작업을 찾을 수 없습니다.',
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      if (!authorize(interaction as never, options.settingsStore, 'ADMIN').allowed) {
        await interaction.reply({
          content: '이 작업을 승인하거나 거절할 권한이 없습니다.',
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      const second = interaction.customId.startsWith('fix-second-');
      const expected = second ? 'WAITING_SECOND_APPROVAL' : 'WAITING_APPROVAL';
      if (task.status !== expected) {
        await interaction.reply({
          content: '이 작업은 이미 처리되었거나 실행할 수 없는 상태입니다.',
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      const expiry = second ? task.secondApprovalExpiresAt : task.expiresAt;
      if (!expiry || Date.parse(expiry) <= Date.now()) {
        options.fixTaskStore.transition(task.id, expected, 'EXPIRED');
        await interaction.reply({
          content: '이 작업 요청은 만료되었습니다. /fix-issue로 다시 분석해 주세요.',
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      const approve =
        interaction.customId.startsWith('fix-approve:') ||
        interaction.customId.startsWith('fix-second-approve:');
      const next = second
        ? approve
          ? 'SECOND_APPROVED'
          : 'SECOND_REJECTED'
        : approve
          ? 'APPROVED'
          : 'REJECTED';
      options.fixTaskStore.transition(
        task.id,
        expected,
        next,
        second ? undefined : interaction.user.id,
      );
      if (second && approve)
        options.fixTaskStore.update(task.id, {
          secondApprovedByUserId: interaction.user.id,
          secondApprovedAt: new Date().toISOString(),
        });
      options.settingsStore.audit({
        operationId: task.id,
        guildId: task.guildId,
        actorUserId: interaction.user.id,
        action: second
          ? approve
            ? 'FIX_SECOND_APPROVED'
            : 'FIX_SECOND_REJECTED'
          : approve
            ? 'FIX_APPROVED'
            : 'FIX_REJECTED',
        target: `${task.owner}/${task.repository}#${task.issueNumber}`,
        success: true,
        metadata: JSON.stringify({ requestedBy: task.requestedByUserId }),
      });
      await interaction.reply({
        content: approve
          ? second
            ? '두 번째 승인이 기록되었습니다. 안전한 쓰기 워커가 설정된 경우에만 Draft PR 생성을 재개합니다.'
            : '첫 번째 승인이 기록되었습니다. 워커를 백그라운드에서 시작합니다. 원격 변경은 아직 없습니다.'
          : '작업 요청을 거절했습니다.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      if (approve) {
        const run = second
          ? options.fixWorker.resumeAfterSecondApproval(task.id)
          : options.fixWorker.executeApprovedTask(task.id);
        void run.catch((error) =>
          options.logger.error({ err: error, taskId: task.id }, 'Fix worker failed'),
        );
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    if (githubCommandNames.has(interaction.commandName)) {
      const now = Date.now();
      const cooldownUntil = cooldownUntilByUser.get(interaction.user.id) ?? 0;
      if (cooldownUntil > now) {
        await interaction.reply({
          content: 'GitHub 조회는 잠시 후 다시 시도해 주세요.',
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      cooldownUntilByUser.set(interaction.user.id, now + 3_000);
    }

    try {
      await command(interaction);
    } catch (error) {
      options.logger.error(
        { err: error, command: interaction.commandName },
        'Command execution failed',
      );
      const message = '작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ content: message, allowedMentions: { parse: [] } })
          .catch(() => undefined);
      } else {
        await interaction
          .reply({ content: message, ephemeral: true, allowedMentions: { parse: [] } })
          .catch(() => undefined);
      }
    }
  });
}
