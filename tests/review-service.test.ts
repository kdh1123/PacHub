import { describe, expect, it, vi } from 'vitest';

import { reviewPullRequest } from '../src/review/reviewService.js';

describe('review service', () => {
  it('paginates changed files and marks excluded lock files', async () => {
    const listFiles = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 30 }, (_, index) => ({
          filename: `src/${index}.ts`,
          status: 'modified',
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: '@@ -0,0 +1 @@\n+export const ok = true;',
        })),
      })
      .mockResolvedValueOnce({
        data: [
          {
            filename: 'package-lock.json',
            status: 'modified',
            additions: 1,
            deletions: 1,
            changes: 2,
          },
        ],
      });
    const client = {
      rest: {
        pulls: {
          get: vi.fn().mockResolvedValue({
            data: {
              number: 3,
              title: 'feat: sample',
              user: { login: 'octo' },
              html_url: 'https://github.com/o/r/pull/3',
              base: { ref: 'main' },
              head: { ref: 'feature' },
              changed_files: 31,
            },
          }),
          listFiles,
        },
      },
    };

    const result = await reviewPullRequest(client as never, {
      owner: 'octo',
      repository: 'repo',
      number: 3,
    });

    expect(listFiles).toHaveBeenCalledTimes(2);
    expect(result.totalFiles).toBe(31);
    expect(result.excludedFiles).toBe(1);
    expect(result.testsChanged).toBe(false);
  });
});
