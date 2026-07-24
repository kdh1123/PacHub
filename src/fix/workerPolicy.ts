import type { Environment } from '../config/env.js';
export function allowedRepositories(value: string): Set<string> {
  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}
export function canRunWorker(
  environment: Environment,
  repository: string,
): { allowed: boolean; reason?: string } {
  if (!environment.FIX_WORKER_ENABLED)
    return { allowed: false, reason: 'FIX_WORKER_ENABLED=false' };
  if (!environment.GITHUB_WRITE_TOKEN)
    return { allowed: false, reason: 'GITHUB_WRITE_TOKEN is not configured' };
  if (!allowedRepositories(environment.FIX_ALLOWED_REPOSITORIES).has(repository.toLowerCase()))
    return { allowed: false, reason: 'repository is not allowlisted' };
  return { allowed: true };
}
