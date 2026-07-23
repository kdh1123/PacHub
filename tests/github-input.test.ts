import { describe, expect, it } from 'vitest';

import { numberedRepositoryInputSchema, repositoryInputSchema } from '../src/github/input.js';

describe('GitHub command input', () => {
  it('accepts a valid owner and repository', () => {
    expect(repositoryInputSchema.parse({ owner: 'octo-org', repository: 'hello_world' })).toEqual({
      owner: 'octo-org',
      repository: 'hello_world',
    });
  });

  it('rejects command-like repository input', () => {
    expect(() =>
      repositoryInputSchema.parse({ owner: 'octo', repository: '../private' }),
    ).toThrow();
  });

  it('removes .git while rejecting GitHub URLs and blank owner values', () => {
    expect(
      repositoryInputSchema.parse({ owner: 'octo', repository: 'project.git' }).repository,
    ).toBe('project');
    expect(() =>
      repositoryInputSchema.parse({ owner: 'octo', repository: 'https://github.com/octo/project' }),
    ).toThrow();
    expect(() => repositoryInputSchema.parse({ owner: ' ', repository: 'project' })).toThrow();
  });

  it('requires a positive issue or pull request number', () => {
    expect(() =>
      numberedRepositoryInputSchema.parse({ owner: 'octo', repository: 'repo', number: 0 }),
    ).toThrow();
    expect(() =>
      numberedRepositoryInputSchema.parse({ owner: 'octo', repository: 'repo', number: '1' }),
    ).toThrow();
    expect(() =>
      numberedRepositoryInputSchema.parse({ owner: 'octo', repository: 'repo', number: 1.5 }),
    ).toThrow();
  });
});
