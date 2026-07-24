import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import type { FileModification } from './types.js';
import { isForbiddenPath } from './policy.js';
export const hashContent = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex');
export async function validateModifications(
  root: string,
  items: FileModification[],
  allowed: string[],
  maxFiles: number,
  maxNewFiles: number,
): Promise<void> {
  if (!items.length || items.length > maxFiles) throw new Error('CHANGE_LIMIT_EXCEEDED');
  let creates = 0;
  const seen = new Set<string>();
  for (const item of items) {
    if (
      !item.path ||
      item.path.includes('\0') ||
      item.path.startsWith('/') ||
      item.path.split('/').includes('..') ||
      seen.has(item.path) ||
      !allowed.includes(item.path) ||
      isForbiddenPath(item.path)
    )
      throw new Error('INVALID_MODIFICATION');
    seen.add(item.path);
    const target = resolve(root, item.path);
    if (relative(root, target).startsWith('..')) throw new Error('INVALID_MODIFICATION');
    const stat = await lstat(target).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new Error('SYMLINK_BLOCKED');
    if (item.operation === 'UPDATE') {
      if (
        !stat?.isFile() ||
        !item.expectedOriginalHash ||
        hashContent(await readFile(target)) !== item.expectedOriginalHash
      )
        throw new Error('INVALID_MODIFICATION');
    } else {
      creates++;
      if (stat || creates > maxNewFiles) throw new Error('INVALID_MODIFICATION');
    }
    if (Buffer.byteLength(item.content, 'utf8') > 256_000) throw new Error('CHANGE_LIMIT_EXCEEDED');
  }
}
