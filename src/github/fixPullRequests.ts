import type { Octokit } from '@octokit/rest';

export interface DraftPullRequestInput {
  owner: string;
  repository: string;
  head: string;
  base: string;
  title: string;
  body: string;
}

export async function findOrCreateDraftPullRequest(
  client: Octokit,
  input: DraftPullRequestInput,
): Promise<{ number: number; url: string; reused: boolean }> {
  const existing = await client.rest.pulls.list({
    owner: input.owner,
    repo: input.repository,
    head: `${input.owner}:${input.head}`,
    state: 'open',
  });
  if (existing.data[0])
    return { number: existing.data[0].number, url: existing.data[0].html_url, reused: true };
  const { data } = await client.rest.pulls.create({
    owner: input.owner,
    repo: input.repository,
    head: input.head,
    base: input.base,
    title: input.title,
    body: input.body,
    draft: true,
  });
  return { number: data.number, url: data.html_url, reused: false };
}
