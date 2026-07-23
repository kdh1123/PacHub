import { describe, expect, it } from 'vitest';

import { summarizeCheckRuns } from '../src/github/checks.js';

describe('CI check aggregation', () => {
  it.each([
    [[], '실행 결과 없음'],
    [[{ status: 'completed', conclusion: 'success' }], '성공'],
    [[{ status: 'completed', conclusion: 'neutral' }], '성공'],
    [[{ status: 'completed', conclusion: 'failure' }], '실패'],
    [[{ status: 'in_progress', conclusion: null }], '진행 중'],
    [[{ status: 'queued', conclusion: null }], '대기 중'],
  ] as const)('summarizes %o as %s', (runs, expected) => {
    expect(summarizeCheckRuns(runs)).toBe(expected);
  });
});
