import { describe, expect, it, vi } from 'vitest';

import { createGitHubCommands } from '../src/discord/commands/github.js';

describe('GitHub Discord commands', () => {
  it('defers then safely edits a repository response', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        full_name: 'octo/project',
        html_url: 'https://github.com/octo/project',
        description: '@everyone ```secret```',
        private: false,
        default_branch: 'main',
        language: 'TypeScript',
        open_issues_count: 1,
        fork: false,
        archived: false,
        stargazers_count: 2,
        forks_count: 3,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    });
    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      options: { getString: vi.fn((name: string) => (name === 'owner' ? 'octo' : 'project')) },
    };
    const commands = createGitHubCommands({ rest: { repos: { get } } } as never);

    await commands.repo.execute(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } }),
    );
  });

  it('returns one deferred error when GitHub is not configured', async () => {
    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      options: { getString: vi.fn((name: string) => (name === 'owner' ? 'octo' : 'project')) },
    };

    await createGitHubCommands(undefined).repo.execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } }),
    );
  });
});
