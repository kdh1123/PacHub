import { describe, expect, it } from 'vitest';

import { classifyFile, getExclusionReason } from '../src/review/fileClassifier.js';

describe('review file filtering and classification', () => {
  it('excludes lock, build, and media files while retaining source files', () => {
    expect(getExclusionReason('package-lock.json')).toContain('잠금');
    expect(getExclusionReason('dist/app.js')).toContain('빌드');
    expect(getExclusionReason('assets/logo.png')).toContain('미디어');
    expect(getExclusionReason('src/app.ts')).toBeUndefined();
  });

  it('classifies test, migration, and CI files', () => {
    expect(classifyFile('tests/app.test.ts')).toContain('Test');
    expect(classifyFile('prisma/migrations/001.sql')).toContain('Migration');
    expect(classifyFile('.github/workflows/test.yml')).toContain('CI/CD');
  });
});
