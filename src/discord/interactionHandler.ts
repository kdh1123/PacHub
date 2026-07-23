import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type pino from 'pino';

import { pingCommand } from './commands/ping.js';
import { createGitHubCommands } from './commands/github.js';
import { createReviewCommand } from './commands/review.js';
import type { Octokit } from '@octokit/rest';
import type { AiProvider } from '../ai/provider.js';
import type { SettingsStore } from '../database/settingsStore.js';
import { createSettingsCommands } from './commands/githubSettings.js';

export function registerInteractionHandler(
  client: Client,
  options: {
    environment: string;
    logger: pino.Logger;
    githubClient?: Octokit;
    aiProvider?: AiProvider;
    settingsStore: SettingsStore;
  },
): void {
  const githubCommands = createGitHubCommands(options.githubClient, options.settingsStore);
  const reviewCommand = createReviewCommand(
    options.githubClient,
    options.aiProvider,
    options.settingsStore,
  );
  const settingsCommands = createSettingsCommands(options.settingsStore, options.githubClient);
  const githubCommandNames = new Set([
    githubCommands.repo.data.name,
    githubCommands.issue.data.name,
    githubCommands.pr.data.name,
    reviewCommand.data.name,
  ]);
  const cooldownUntilByUser = new Map<string, number>();
  const commands = new Map<string, (interaction: ChatInputCommandInteraction) => Promise<void>>([
    [pingCommand.data.name, (interaction) => pingCommand.execute(interaction, options.environment)],
    [githubCommands.repo.data.name, (interaction) => githubCommands.repo.execute(interaction)],
    [githubCommands.issue.data.name, (interaction) => githubCommands.issue.execute(interaction)],
    [githubCommands.pr.data.name, (interaction) => githubCommands.pr.execute(interaction)],
    [reviewCommand.data.name, (interaction) => reviewCommand.execute(interaction)],
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
