import type { ChatInputCommandInteraction } from 'discord.js';
import { repositoryInputSchema, type RepositoryInput } from '../github/input.js';
import type { SettingsStore } from '../database/settingsStore.js';

export function resolveRepositoryInput(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore | undefined,
): RepositoryInput {
  const owner = interaction.options.getString('owner');
  const repository = interaction.options.getString('repository');
  if (Boolean(owner) !== Boolean(repository)) throw new Error('REPOSITORY_PAIR_REQUIRED');
  if (owner && repository) return repositoryInputSchema.parse({ owner, repository });
  if (!interaction.guildId) throw new Error('DEFAULT_REPOSITORY_UNAVAILABLE');
  const config = store?.getConfig(interaction.guildId);
  if (!config) throw new Error('DEFAULT_REPOSITORY_NOT_CONFIGURED');
  return repositoryInputSchema.parse({ owner: config.owner, repository: config.repository });
}

export function requiresConfiguredAccess(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore | undefined,
): boolean {
  return (
    (!interaction.options.getString('owner') && !interaction.options.getString('repository')) ||
    Boolean(interaction.guildId && store?.roles(interaction.guildId).length)
  );
}
