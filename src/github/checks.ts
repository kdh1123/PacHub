import type { Octokit } from '@octokit/rest';

import type { RepositoryInput } from './input.js';

export type CiState = '성공' | '실패' | '진행 중' | '대기 중' | '실행 결과 없음' | '확인 불가';

export function summarizeCheckRuns(
  checkRuns: Array<{ status: string; conclusion: string | null }>,
): CiState {
  if (checkRuns.length === 0) return '실행 결과 없음';
  if (
    checkRuns.some((check) =>
      ['failure', 'timed_out', 'cancelled', 'action_required'].includes(check.conclusion ?? ''),
    )
  )
    return '실패';
  if (checkRuns.some((check) => check.status === 'in_progress')) return '진행 중';
  if (checkRuns.some((check) => check.status === 'queued' || check.status === 'waiting'))
    return '대기 중';
  return '성공';
}

export async function getCiState(
  client: Octokit,
  input: RepositoryInput,
  ref: string,
): Promise<CiState> {
  try {
    const { data } = await client.rest.checks.listForRef({
      owner: input.owner,
      repo: input.repository,
      ref,
    });
    return summarizeCheckRuns(data.check_runs);
  } catch {
    return '확인 불가';
  }
}
