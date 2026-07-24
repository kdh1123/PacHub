import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
export class WorkspaceManager {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  async repositoryPath(taskId: string): Promise<string> {
    if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error('INVALID_TASK_ID');
    await mkdir(this.root, { recursive: true });
    const root = await realpath(this.root);
    const task = resolve(root, taskId);
    if (!task.startsWith(root + sep)) throw new Error('WORKSPACE_ESCAPE');
    try {
      await lstat(task);
      throw new Error('WORKSPACE_EXISTS');
    } catch (e) {
      if (e instanceof Error && e.message !== 'ENOENT') throw e;
    }
    await mkdir(task, { recursive: false, mode: 0o700 });
    return resolve(task, 'repository');
  }
  async cleanup(taskId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error('INVALID_TASK_ID');
    const root = await realpath(this.root);
    const task = resolve(root, taskId);
    if (!task.startsWith(root + sep)) throw new Error('WORKSPACE_ESCAPE');
    const stat = await lstat(task).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new Error('WORKSPACE_SYMLINK');
    if (stat) await rm(task, { recursive: true, force: false });
  }
  async existingRepositoryPath(taskId: string): Promise<string> {
    if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error('INVALID_TASK_ID');
    const root = await realpath(this.root);
    const task = resolve(root, taskId);
    const repository = resolve(task, 'repository');
    if (!repository.startsWith(root + sep) || (await lstat(task)).isSymbolicLink())
      throw new Error('WORKSPACE_ESCAPE');
    return repository;
  }
}
