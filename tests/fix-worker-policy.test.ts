import { describe, expect, it } from 'vitest';
import { canRunWorker } from '../src/fix/workerPolicy.js';
const base = {
  FIX_WORKER_ENABLED: false,
  FIX_PUSH_ENABLED: false,
  FIX_ALLOWED_REPOSITORIES: 'octo/sandbox',
  GITHUB_WRITE_TOKEN: 'write-token',
} as never;
describe('fix worker policy', () => {
  it('defaults to blocking real repository work', () =>
    expect(canRunWorker(base, 'octo/sandbox')).toMatchObject({ allowed: false }));
  it('requires exact allowlist membership and a write token', () => {
    expect(canRunWorker({ ...base, FIX_WORKER_ENABLED: true }, 'octo/other').allowed).toBe(false);
    expect(canRunWorker({ ...base, FIX_WORKER_ENABLED: true }, 'OCTO/SANDBOX').allowed).toBe(true);
  });
});
