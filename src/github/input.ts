import { z } from 'zod';

const ownerPart = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, '영문, 숫자, ., _, -만 사용할 수 있습니다.');

const repositoryPart = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((value) => (value.endsWith('.git') ? value.slice(0, -4) : value))
  .pipe(
    z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_.-]+$/, '저장소 이름 형식이 올바르지 않습니다.'),
  );

const issueOrPullRequestNumber = z.number().int().positive().max(2_147_483_647);

export const repositoryInputSchema = z.object({
  owner: ownerPart,
  repository: repositoryPart,
});

export const numberedRepositoryInputSchema = repositoryInputSchema.extend({
  number: issueOrPullRequestNumber,
});

export type RepositoryInput = z.infer<typeof repositoryInputSchema>;
export type NumberedRepositoryInput = z.infer<typeof numberedRepositoryInputSchema>;
