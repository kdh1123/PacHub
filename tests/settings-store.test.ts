import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/database/settingsStore.js';

describe('SettingsStore', () => {
  it('keeps repository and role settings isolated by guild', () => {
    const store = new SettingsStore(':memory:');
    const now = '2026-01-01T00:00:00.000Z';
    store.saveConfig({
      guildId: 'guild-a',
      owner: 'octo',
      repository: 'one',
      fullName: 'octo/one',
      repositoryId: 1,
      defaultBranch: 'main',
      visibility: 'private',
      connectedByUserId: 'user-a',
      createdAt: now,
      updatedAt: now,
    });
    store.upsertRole({
      guildId: 'guild-a',
      roleId: 'role-a',
      permissionLevel: 'ADMIN',
      createdByUserId: 'user-a',
      createdAt: now,
    });
    expect(store.getConfig('guild-a')?.repositoryId).toBe(1);
    expect(store.getConfig('guild-b')).toBeUndefined();
    expect(store.roles('guild-b')).toEqual([]);
    store.deleteConfig('guild-a');
    expect(store.getConfig('guild-a')).toBeUndefined();
    expect(store.roles('guild-a')).toHaveLength(1);
    store.close();
  });

  it('updates an existing role without duplicating it and records safe audit data', () => {
    const store = new SettingsStore(':memory:');
    const role = {
      guildId: 'guild-a',
      roleId: 'role-a',
      permissionLevel: 'VIEWER' as const,
      createdByUserId: 'user-a',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    store.upsertRole(role);
    store.upsertRole({ ...role, permissionLevel: 'REVIEWER' });
    store.audit({
      operationId: 'op-1',
      guildId: 'guild-a',
      actorUserId: 'user-a',
      action: 'ROLE_PERMISSION_CHANGED',
      target: 'role-a',
      success: true,
      metadata: JSON.stringify({ before: 'VIEWER', after: 'REVIEWER' }),
    });
    expect(store.roles('guild-a')).toEqual([{ ...role, permissionLevel: 'REVIEWER' }]);
    expect(store.auditLogs('guild-a')[0]).toMatchObject({
      operationId: 'op-1',
      action: 'ROLE_PERMISSION_CHANGED',
      success: 1,
    });
    store.close();
  });
});
