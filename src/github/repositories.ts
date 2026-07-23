import type { Octokit } from '@octokit/rest';

import type { RepositoryInput } from './input.js';

export async function getRepository(client: Octokit, input: RepositoryInput) {
  const { data } = await client.rest.repos.get({ owner: input.owner, repo: input.repository });
  return data;
}
