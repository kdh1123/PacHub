import type { Octokit } from '@octokit/rest';

import type { NumberedRepositoryInput } from './input.js';

export async function getIssue(client: Octokit, input: NumberedRepositoryInput) {
  const { data } = await client.rest.issues.get({
    owner: input.owner,
    repo: input.repository,
    issue_number: input.number,
  });

  if ('pull_request' in data) {
    throw new Error('PULL_REQUEST_NOT_ISSUE');
  }

  return data;
}
