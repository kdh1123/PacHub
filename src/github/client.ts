import { Octokit } from '@octokit/rest';

export function createGitHubClient(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: 'discord-github-bot/0.1.0',
    request: { timeout: 10_000 },
  });
}
