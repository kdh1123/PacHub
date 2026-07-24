import { loadEnvironment } from './config/env.js';
import { createDiscordClient } from './discord/client.js';
import { registerInteractionHandler } from './discord/interactionHandler.js';
import { createGitHubClient } from './github/client.js';
import { createAiProvider } from './ai/client.js';
import { createLogger } from './utils/logger.js';
import { SettingsStore } from './database/settingsStore.js';
import { FixTaskStore } from './fix/taskStore.js';
import { LocalFixWorker } from './fix/worker.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment.LOG_LEVEL);
  const client = createDiscordClient();

  const githubClient = environment.GITHUB_TOKEN
    ? createGitHubClient(environment.GITHUB_TOKEN)
    : undefined;
  const aiProvider = createAiProvider(environment);
  const settingsStore = new SettingsStore(environment.DATABASE_URL);
  const fixTaskStore = new FixTaskStore(environment.DATABASE_URL);
  const fixWorker = new LocalFixWorker(
    fixTaskStore,
    environment,
    environment.GITHUB_WRITE_TOKEN ? createGitHubClient(environment.GITHUB_WRITE_TOKEN) : undefined,
    aiProvider && aiProvider.generateModification
      ? {
          generateModification: (input) =>
            aiProvider.generateModification!(input).then((result) => {
              if (!result) throw new Error('MODIFICATION_AGENT_UNAVAILABLE');
              return result;
            }),
        }
      : undefined,
  );
  registerInteractionHandler(client, {
    environment: environment.NODE_ENV,
    logger,
    githubClient,
    aiProvider,
    settingsStore,
    fixTaskStore,
    fixWorker,
  });

  client.once('ready', (readyClient) => {
    logger.info(
      { userId: readyClient.user.id, username: readyClient.user.tag },
      'Discord client is ready',
    );
  });
  client.on('error', (error) => logger.error({ err: error }, 'Discord client error'));
  process.on('unhandledRejection', (error) => logger.error({ err: error }, 'Unhandled rejection'));
  process.on('uncaughtException', (error) => logger.fatal({ err: error }, 'Uncaught exception'));

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Stopping Discord client');
    client.destroy();
    settingsStore.close();
    fixTaskStore.close();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(environment.DISCORD_TOKEN);
}

main().catch((error: unknown) => {
  console.error('Bot startup failed. Check environment configuration and Discord credentials.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
