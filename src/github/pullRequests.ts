import type { Octokit } from '@octokit/rest';

import type { NumberedRepositoryInput } from './input.js';
import { getCiState } from './checks.js';

export async function getPullRequest(client: Octokit, input: NumberedRepositoryInput) {
  const { data: pullRequest } = await client.rest.pulls.get({
    owner: input.owner,
    repo: input.repository,
    pull_number: input.number,
  });
  const ciState = await getCiState(client, input, pullRequest.head.sha);

  return { pullRequest, ciState };
}
