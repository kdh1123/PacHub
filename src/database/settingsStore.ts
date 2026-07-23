import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type PermissionLevel = 'VIEWER' | 'REVIEWER' | 'ADMIN';
export interface GuildConfig {
  guildId: string;
  owner: string;
  repository: string;
  fullName: string;
  repositoryId: number;
  defaultBranch: string;
  visibility: 'public' | 'private';
  connectedByUserId: string;
  createdAt: string;
  updatedAt: string;
}
export interface RolePermission {
  guildId: string;
  roleId: string;
  permissionLevel: PermissionLevel;
  createdByUserId: string;
  createdAt: string;
}
export interface AuditLog {
  id: number;
  operationId: string;
  guildId: string;
  actorUserId: string;
  action: string;
  target: string;
  success: boolean;
  metadata: string | null;
  createdAt: string;
}

/** SQLite-backed server settings. It deliberately stores configuration metadata only, never tokens. */
export class SettingsStore {
  private readonly db: Database.Database;

  constructor(databaseUrl = 'file:./data/pachub.sqlite') {
    const path = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guildId TEXT PRIMARY KEY, owner TEXT NOT NULL, repository TEXT NOT NULL, fullName TEXT NOT NULL,
        repositoryId INTEGER NOT NULL, defaultBranch TEXT NOT NULL, visibility TEXT NOT NULL,
        connectedByUserId TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS role_permissions (
        guildId TEXT NOT NULL, roleId TEXT NOT NULL, permissionLevel TEXT NOT NULL,
        createdByUserId TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT '', PRIMARY KEY(guildId, roleId)
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, operationId TEXT NOT NULL, guildId TEXT NOT NULL,
        actorUserId TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, success INTEGER NOT NULL,
        metadata TEXT, createdAt TEXT NOT NULL
      );
    `);
  }

  getConfig(guildId: string): GuildConfig | undefined {
    return this.db.prepare('SELECT * FROM guild_configs WHERE guildId = ?').get(guildId) as
      GuildConfig | undefined;
  }
  saveConfig(config: GuildConfig): void {
    this.db
      .prepare(
        `INSERT INTO guild_configs VALUES (@guildId,@owner,@repository,@fullName,@repositoryId,@defaultBranch,@visibility,@connectedByUserId,@createdAt,@updatedAt) ON CONFLICT(guildId) DO UPDATE SET owner=excluded.owner, repository=excluded.repository, fullName=excluded.fullName, repositoryId=excluded.repositoryId, defaultBranch=excluded.defaultBranch, visibility=excluded.visibility, connectedByUserId=excluded.connectedByUserId, updatedAt=excluded.updatedAt`,
      )
      .run(config);
  }
  deleteConfig(guildId: string): boolean {
    return this.db.prepare('DELETE FROM guild_configs WHERE guildId = ?').run(guildId).changes > 0;
  }
  roles(guildId: string): RolePermission[] {
    return this.db
      .prepare('SELECT * FROM role_permissions WHERE guildId = ? ORDER BY createdAt')
      .all(guildId) as RolePermission[];
  }
  getRole(guildId: string, roleId: string): RolePermission | undefined {
    return this.db
      .prepare('SELECT * FROM role_permissions WHERE guildId = ? AND roleId = ?')
      .get(guildId, roleId) as RolePermission | undefined;
  }
  upsertRole(role: RolePermission): void {
    this.db
      .prepare(
        `INSERT INTO role_permissions VALUES (@guildId,@roleId,@permissionLevel,@createdByUserId,@createdAt) ON CONFLICT(guildId,roleId) DO UPDATE SET permissionLevel=excluded.permissionLevel, createdByUserId=excluded.createdByUserId`,
      )
      .run(role);
  }
  removeRole(guildId: string, roleId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM role_permissions WHERE guildId = ? AND roleId = ?')
        .run(guildId, roleId).changes > 0
    );
  }
  audit(input: Omit<AuditLog, 'id' | 'createdAt'> & { createdAt?: string }): void {
    this.db
      .prepare(
        'INSERT INTO audit_logs(operationId,guildId,actorUserId,action,target,success,metadata,createdAt) VALUES(@operationId,@guildId,@actorUserId,@action,@target,@success,@metadata,@createdAt)',
      )
      .run({
        ...input,
        success: input.success ? 1 : 0,
        createdAt: input.createdAt ?? new Date().toISOString(),
      });
  }
  auditLogs(guildId: string): AuditLog[] {
    return this.db
      .prepare('SELECT * FROM audit_logs WHERE guildId = ? ORDER BY id')
      .all(guildId) as AuditLog[];
  }
  close(): void {
    this.db.close();
  }
}
