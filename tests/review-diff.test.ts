import { describe, expect, it } from 'vitest';

import { parseAddedLines } from '../src/review/diffParser.js';

describe('unified diff parser', () => {
  it('returns added lines with new-file line numbers across hunks', () => {
    const patch = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,3 @@',
      ' unchanged',
      '+added',
      '-removed',
      '@@ -10,1 +12,2 @@',
      '+next',
    ].join('\n');
    expect(parseAddedLines(patch)).toEqual([
      { line: 2, content: 'added' },
      { line: 12, content: 'next' },
    ]);
  });

  it('handles missing patches safely', () => {
    expect(parseAddedLines(undefined)).toEqual([]);
  });
});
