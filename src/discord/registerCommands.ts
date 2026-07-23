import { REST, Routes } from 'discord.js';

import { loadEnvironment } from '../config/env.js';
import { pingCommand } from './commands/ping.js';
import { createGitHubCommands } from './commands/github.js';
import { createReviewCommand } from './commands/review.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const rest = new REST({ version: '10' }).setToken(environment.DISCORD_TOKEN);
  const githubCommands = createGitHubCommands(undefined);
  const reviewCommand = createReviewCommand(undefined);
  const body = [
    pingCommand.data.toJSON(),
    githubCommands.repo.data.toJSON(),
    githubCommands.issue.data.toJSON(),
    githubCommands.pr.data.toJSON(),
    reviewCommand.data.toJSON(),
  ];

  if (environment.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(environment.DISCORD_CLIENT_ID, environment.DISCORD_GUILD_ID),
      {
        body,
      },
    );
    console.log(
      'Registered /ping, /repo, /issue, /pr, and /review for the configured development guild.',
    );
    return;
  }

  await rest.put(Routes.applicationCommands(environment.DISCORD_CLIENT_ID), { body });
  console.log(
    'Registered /ping, /repo, /issue, /pr, and /review globally. Global updates may take up to an hour.',
  );
}

main().catch((error: unknown) => {
  console.error('Command registration failed.', error);
  process.exitCode = 1;
});
