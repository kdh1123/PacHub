import { describe, expect, it, vi } from 'vitest';
import { findOrCreateDraftPullRequest } from '../src/github/fixPullRequests.js';

describe('findOrCreateDraftPullRequest', () => {
  const input = {
    owner: 'owner',
    repository: 'sandbox',
    head: 'fix/issue-1-a',
    base: 'main',
    title: 'fix: resolve issue #1',
    body: 'safe body',
  };
  it('reuses an existing open head PR instead of creating a duplicate', async () => {
    const create = vi.fn();
    const client = {
      rest: {
        pulls: {
          list: vi
            .fn()
            .mockResolvedValue({ data: [{ number: 7, html_url: 'https://example.test/pr/7' }] }),
          create,
        },
      },
    };
    await expect(findOrCreateDraftPullRequest(client as never, input)).resolves.toEqual({
      number: 7,
      url: 'https://example.test/pr/7',
      reused: true,
    });
    expect(create).not.toHaveBeenCalled();
  });
  it('creates a draft PR with the approved base and head', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ data: { number: 8, html_url: 'https://example.test/pr/8' } });
    const client = { rest: { pulls: { list: vi.fn().mockResolvedValue({ data: [] }), create } } };
    await findOrCreateDraftPullRequest(client as never, input);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ head: input.head, base: input.base, draft: true }),
    );
  });
});
