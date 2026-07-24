import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canTransition, type FixStatus, type FixTask } from './types.js';
const jsonFields = new Set(['plannedFiles', 'changedFiles', 'validationResults', 'diffSummary']);
const columns = [
  'workspacePathHash',
  'headShaAtAnalysis',
  'headShaAtExecution',
  'baseBranchSha',
  'workerStartedAt',
  'validationStartedAt',
  'validationCompletedAt',
  'secondApprovalRequestedAt',
  'secondApprovedAt',
  'secondApprovedByUserId',
  'secondApprovalExpiresAt',
  'changedFilesJson',
  'validationResultsJson',
  'diffSummaryJson',
  'commitSha',
  'committedAt',
  'pushedAt',
  'remoteBranch',
  'pushSucceeded',
  'pullRequestNumber',
  'pullRequestUrl',
  'pullRequestDraft',
  'completedAt',
  'cancelReason',
  'cleanupStatus',
  'failureStage',
  'errorCode',
  'errorSummary',
];
export class FixTaskStore {
  private db: Database.Database;
  constructor(url: string) {
    const path = url.startsWith('file:') ? url.slice(5) : url;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS fix_tasks (id TEXT PRIMARY KEY, guildId TEXT NOT NULL, channelId TEXT NOT NULL, requestedByUserId TEXT NOT NULL, approvedByUserId TEXT, owner TEXT NOT NULL, repository TEXT NOT NULL, issueNumber INTEGER NOT NULL, issueTitle TEXT NOT NULL, baseBranch TEXT NOT NULL, workBranch TEXT NOT NULL, useAi INTEGER NOT NULL, dryRun INTEGER NOT NULL, status TEXT NOT NULL, plannedFiles TEXT NOT NULL, riskLevel TEXT NOT NULL, eligibility TEXT NOT NULL, createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL, updatedAt TEXT NOT NULL)',
    );
    const existing = new Set(
      (this.db.prepare('PRAGMA table_info(fix_tasks)').all() as { name: string }[]).map(
        (x) => x.name,
      ),
    );
    for (const column of columns)
      if (!existing.has(column))
        this.db.exec(
          `ALTER TABLE fix_tasks ADD COLUMN ${column} ${column === 'pullRequestNumber' ? 'INTEGER' : 'TEXT'}`,
        );
  }
  create(task: FixTask): void {
    this.db
      .prepare(
        'INSERT INTO fix_tasks (id,guildId,channelId,requestedByUserId,approvedByUserId,owner,repository,issueNumber,issueTitle,baseBranch,workBranch,useAi,dryRun,status,plannedFiles,riskLevel,eligibility,createdAt,expiresAt,updatedAt) VALUES (@id,@guildId,@channelId,@requestedByUserId,@approvedByUserId,@owner,@repository,@issueNumber,@issueTitle,@baseBranch,@workBranch,@useAi,@dryRun,@status,@plannedFiles,@riskLevel,@eligibility,@createdAt,@expiresAt,@updatedAt)',
      )
      .run({
        ...task,
        approvedByUserId: task.approvedByUserId ?? null,
        useAi: task.useAi ? 1 : 0,
        dryRun: task.dryRun ? 1 : 0,
        plannedFiles: JSON.stringify(task.plannedFiles),
      });
  }
  get(id: string): FixTask | undefined {
    const row = this.db.prepare('SELECT * FROM fix_tasks WHERE id=?').get(id) as
      Record<string, unknown> | undefined;
    if (!row) return undefined;
    const parse = (v: unknown) => {
      try {
        return v ? JSON.parse(String(v)) : undefined;
      } catch {
        return undefined;
      }
    };
    return {
      ...row,
      useAi: Boolean(row.useAi),
      dryRun: Boolean(row.dryRun),
      plannedFiles: parse(row.plannedFiles) ?? [],
      changedFiles: parse(row.changedFilesJson),
      validationResults: parse(row.validationResultsJson),
      diffSummary: parse(row.diffSummaryJson),
      secondApprovedByUserId: row.secondApprovedByUserId as string | undefined,
    } as FixTask;
  }
  transition(id: string, from: FixStatus, to: FixStatus, approvedByUserId?: string): boolean {
    if (!canTransition(from, to)) return false;
    return (
      this.db
        .prepare(
          'UPDATE fix_tasks SET status=?, approvedByUserId=COALESCE(?,approvedByUserId), updatedAt=? WHERE id=? AND status=?',
        )
        .run(to, approvedByUserId ?? null, new Date().toISOString(), id, from).changes === 1
    );
  }
  update(id: string, values: Partial<FixTask>): void {
    const pairs: string[] = [];
    const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() };
    for (const [key, value] of Object.entries(values)) {
      if (key === 'id' || key === 'status') continue;
      const column =
        key === 'changedFiles'
          ? 'changedFilesJson'
          : key === 'validationResults'
            ? 'validationResultsJson'
            : key === 'diffSummary'
              ? 'diffSummaryJson'
              : key;
      if (!columns.includes(column) && !jsonFields.has(key)) continue;
      pairs.push(`${column}=@${column}`);
      params[column] = [
        'plannedFiles',
        'changedFiles',
        'validationResults',
        'diffSummary',
      ].includes(key)
        ? JSON.stringify(value).slice(0, 32000)
        : (value ?? null);
    }
    if (pairs.length)
      this.db
        .prepare(`UPDATE fix_tasks SET ${pairs.join(',')}, updatedAt=@updatedAt WHERE id=@id`)
        .run(params);
  }
  close(): void {
    this.db.close();
  }
}
