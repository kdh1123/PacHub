import { REST, Routes } from 'discord.js';

import { loadEnvironment } from '../config/env.js';
import { pingCommand } from './commands/ping.js';
import { createGitHubCommands } from './commands/github.js';
import { createReviewCommand } from './commands/review.js';
import { SettingsStore } from '../database/settingsStore.js';
import { createSettingsCommands } from './commands/githubSettings.js';
import { createAnalyzeIssueCommand } from './commands/analyzeIssue.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const rest = new REST({ version: '10' }).setToken(environment.DISCORD_TOKEN);
  const store = new SettingsStore(environment.DATABASE_URL);
  const githubCommands = createGitHubCommands(undefined, store);
  const reviewCommand = createReviewCommand(undefined, undefined, store);
  const settingsCommands = createSettingsCommands(store);
  const analyzeIssueCommand = createAnalyzeIssueCommand(undefined, undefined, store);
  const body = [
    pingCommand.data.toJSON(),
    githubCommands.repo.data.toJSON(),
    githubCommands.issue.data.toJSON(),
    githubCommands.pr.data.toJSON(),
    reviewCommand.data.toJSON(),
    analyzeIssueCommand.data.toJSON(),
    settingsCommands.connect.data.toJSON(),
    settingsCommands.disconnect.data.toJSON(),
    settingsCommands.config.data.toJSON(),
    settingsCommands.roleAdd.data.toJSON(),
    settingsCommands.roleRemove.data.toJSON(),
    settingsCommands.roles.data.toJSON(),
  ];

  if (environment.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(environment.DISCORD_CLIENT_ID, environment.DISCORD_GUILD_ID),
      {
        body,
      },
    );
    console.log('Registered GitHub collaboration commands for the configured development guild.');
    return;
  }

  await rest.put(Routes.applicationCommands(environment.DISCORD_CLIENT_ID), { body });
  console.log(
    'Registered GitHub collaboration commands globally. Global updates may take up to an hour.',
  );
}

main().catch((error: unknown) => {
  console.error('Command registration failed.', error);
  process.exitCode = 1;
});
