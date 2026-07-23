import { describe, expect, it, vi } from 'vitest';

import { getRepository } from '../src/github/repositories.js';

describe('GitHub repository lookup', () => {
  it('uses the Octokit repos API with validated owner and repository', async () => {
    const get = vi.fn().mockResolvedValue({ data: { full_name: 'octo/example' } });
    const client = { rest: { repos: { get } } };

    const repository = await getRepository(client as never, {
      owner: 'octo',
      repository: 'example',
    });

    expect(get).toHaveBeenCalledWith({ owner: 'octo', repo: 'example' });
    expect(repository.full_name).toBe('octo/example');
  });
});
