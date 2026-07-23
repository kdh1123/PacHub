import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { authorizeGuildMember } from '../src/security/authorization.js';

const member = (roleIds: string[], administrator = false) =>
  ({
    permissions: {
      has: (flag: bigint) => administrator && flag === PermissionFlagsBits.Administrator,
    },
    roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
  }) as never;
const permissions = [
  {
    guildId: 'guild',
    roleId: 'viewer',
    permissionLevel: 'VIEWER' as const,
    createdByUserId: 'u',
    createdAt: '',
  },
  {
    guildId: 'guild',
    roleId: 'reviewer',
    permissionLevel: 'REVIEWER' as const,
    createdByUserId: 'u',
    createdAt: '',
  },
  {
    guildId: 'guild',
    roleId: 'admin',
    permissionLevel: 'ADMIN' as const,
    createdByUserId: 'u',
    createdAt: '',
  },
];

describe('authorization', () => {
  it('uses the highest matching role and enforces rank', () => {
    expect(
      authorizeGuildMember({
        guildId: 'guild',
        userId: 'u',
        member: member(['viewer', 'reviewer']),
        permissions,
        required: 'REVIEWER',
      }),
    ).toMatchObject({ allowed: true, actualLevel: 'REVIEWER' });
    expect(
      authorizeGuildMember({
        guildId: 'guild',
        userId: 'u',
        member: member(['viewer']),
        permissions,
        required: 'REVIEWER',
      }),
    ).toMatchObject({ allowed: false, actualLevel: 'VIEWER' });
  });
  it('grants owner and Discord Administrator access and denies DMs', () => {
    expect(
      authorizeGuildMember({
        guildId: 'guild',
        guildOwnerId: 'owner',
        userId: 'owner',
        member: member([]),
        permissions: [],
        required: 'ADMIN',
      }).allowed,
    ).toBe(true);
    expect(
      authorizeGuildMember({
        guildId: 'guild',
        userId: 'u',
        member: member([], true),
        permissions: [],
        required: 'ADMIN',
      }).allowed,
    ).toBe(true);
    expect(
      authorizeGuildMember({ userId: 'u', member: member([]), permissions: [], required: 'VIEWER' })
        .reason,
    ).toBe('NOT_GUILD');
  });
});
