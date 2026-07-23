import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import type { PermissionLevel, RolePermission, SettingsStore } from '../database/settingsStore.js';

const rank: Record<PermissionLevel, number> = { VIEWER: 1, REVIEWER: 2, ADMIN: 3 };
export interface AuthorizationResult {
  allowed: boolean;
  requiredLevel: PermissionLevel;
  actualLevel?: PermissionLevel;
  reason?: 'NOT_GUILD' | 'MEMBER_UNAVAILABLE' | 'INSUFFICIENT_PERMISSION';
}

export function authorizeGuildMember(input: {
  guildId?: string | null;
  guildOwnerId?: string;
  userId: string;
  member?: Pick<GuildMember, 'permissions' | 'roles'> | null;
  permissions: RolePermission[];
  required: PermissionLevel;
}): AuthorizationResult {
  if (!input.guildId) return { allowed: false, requiredLevel: input.required, reason: 'NOT_GUILD' };
  if (!input.member)
    return { allowed: false, requiredLevel: input.required, reason: 'MEMBER_UNAVAILABLE' };
  if (
    input.guildOwnerId === input.userId ||
    input.member.permissions.has(PermissionFlagsBits.Administrator)
  )
    return { allowed: true, actualLevel: 'ADMIN', requiredLevel: input.required };
  const roleIds = new Set(Array.from(input.member.roles.cache.values(), (role) => role.id));
  const actualLevel = input.permissions.reduce<PermissionLevel | undefined>(
    (highest, permission) =>
      roleIds.has(permission.roleId) &&
      (!highest || rank[permission.permissionLevel] > rank[highest])
        ? permission.permissionLevel
        : highest,
    undefined,
  );
  return {
    allowed: Boolean(actualLevel && rank[actualLevel] >= rank[input.required]),
    actualLevel,
    requiredLevel: input.required,
    reason: actualLevel ? 'INSUFFICIENT_PERMISSION' : 'INSUFFICIENT_PERMISSION',
  };
}

export function authorize(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore,
  required: PermissionLevel,
): AuthorizationResult {
  const member =
    interaction.member && !Array.isArray(interaction.member.roles)
      ? (interaction.member as GuildMember)
      : null;
  return authorizeGuildMember({
    guildId: interaction.guildId,
    guildOwnerId: interaction.guild?.ownerId,
    userId: interaction.user.id,
    member,
    permissions: interaction.guildId ? store.roles(interaction.guildId) : [],
    required,
  });
}

export function hasPermission(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore,
  required: PermissionLevel,
): boolean {
  return authorize(interaction, store, required).allowed;
}
