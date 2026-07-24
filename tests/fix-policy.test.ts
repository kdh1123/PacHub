import { describe, expect, it } from 'vitest';
import { assessFix } from '../src/fix/policy.js';
import { canTransition, workBranch } from '../src/fix/types.js';

describe('fix workflow safety policy', () => {
  it('only permits explicit status transitions and safe branch names', () => {
    expect(canTransition('WAITING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('COMPLETED', 'APPROVED')).toBe(false);
    expect(workBranch(12, '한글 / Unsafe title!', 'abcdef')).toBe(
      'fix/issue-12-unsafe-title-abcdef',
    );
  });
  it('blocks automatic work without strong, non-forbidden file evidence', () => {
    const result = assessFix({
      relatedFiles: [
        {
          path: '.github/workflows/deploy.yml',
          relevance: 'HIGH',
          reasons: [],
          contentAnalyzed: false,
        },
      ],
      causeCandidates: [{ confidence: 'LOW' }],
    } as never);
    expect(result.eligibility).toBe('BLOCKED');
    expect(result.risk).toBe('HIGH');
  });
});
