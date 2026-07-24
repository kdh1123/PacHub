import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const allowed = new Set(['git', 'npm']);
export async function runSafe(
  command: 'git' | 'npm',
  args: string[],
  cwd: string,
  timeoutMs: number,
  environment?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  if (!allowed.has(command)) throw new Error('COMMAND_NOT_ALLOWED');
  const result = await run(command, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 64_000,
    shell: false,
    env: environment,
  });
  return { stdout: result.stdout.slice(0, 8_000), stderr: result.stderr.slice(0, 8_000) };
}
