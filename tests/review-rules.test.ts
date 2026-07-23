import { describe, expect, it } from 'vitest';

import { analyzeFileRules } from '../src/review/rules.js';

const file = (patch: string, filename = 'src/app.ts') => ({
  filename,
  status: 'modified',
  additions: 1,
  deletions: 0,
  changes: 1,
  patch,
});

describe('review rules', () => {
  it('detects and masks probable private credentials', () => {
    const findings = analyzeFileRules(
      file('@@ -0,0 +1 @@\n+const token = "github_pat_abcdefghijklmnopqrstuvwxyz123456";'),
    );
    expect(findings[0]?.severity).toBe('HIGH');
    expect(findings[0]?.evidence).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('detects destructive SQL, dynamic code, and workflow permissions', () => {
    expect(
      analyzeFileRules(file('@@ -0,0 +1 @@\n+eval(userInput)')).some(
        (finding) => finding.id === 'dangerous-code',
      ),
    ).toBe(true);
    expect(
      analyzeFileRules(file('@@ -0,0 +1 @@\n+DROP TABLE users;')).some(
        (finding) => finding.id === 'destructive-migration',
      ),
    ).toBe(true);
    expect(
      analyzeFileRules(
        file('@@ -0,0 +1 @@\n+permissions: write-all', '.github/workflows/test.yml'),
      ).some((finding) => finding.id === 'workflow-security'),
    ).toBe(true);
  });
});
