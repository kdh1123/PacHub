import 'dotenv/config';
import { z } from 'zod';

const optionalNonEmptyString = (schema: z.ZodString) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'DISCORD_CLIENT_ID must be a Discord snowflake'),
  DISCORD_GUILD_ID: optionalNonEmptyString(
    z.string().regex(/^\d+$/, 'DISCORD_GUILD_ID must be a Discord snowflake'),
  ),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN cannot be empty').optional(),
  GITHUB_WRITE_TOKEN: z.string().min(1).optional(),
  FIX_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  FIX_PUSH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  FIX_ALLOWED_REPOSITORIES: z.string().default(''),
  FIX_WORKSPACE_ROOT: z.string().min(1).default('/tmp/discord-github-bot-tasks'),
  FIX_TASK_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(60).default(20),
  FIX_SECOND_APPROVAL_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  FIX_MAX_FILES: z.coerce.number().int().min(1).max(20).default(10),
  FIX_MAX_NEW_FILES: z.coerce.number().int().min(0).max(5).default(3),
  FIX_MAX_CHANGED_LINES: z.coerce.number().int().min(1).max(2000).default(1000),
  FIX_MAX_FILE_CHANGED_LINES: z.coerce.number().int().min(1).max(500).default(400),
  FIX_ALLOW_DEPENDENCY_INSTALL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  GIT_BOT_NAME: optionalNonEmptyString(z.string().min(1)),
  GIT_BOT_EMAIL: optionalNonEmptyString(z.string().email()),
  DATABASE_URL: z.string().min(1).default('file:./data/pachub.sqlite'),
  AI_PROVIDER: z.enum(['none', 'openai-compatible']).default('none'),
  AI_API_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().min(1).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(input: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(input);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration: ${details.join('; ')}`);
  }

  if (
    parsed.data.AI_PROVIDER === 'openai-compatible' &&
    (!parsed.data.AI_API_KEY || !parsed.data.AI_BASE_URL || !parsed.data.AI_MODEL)
  ) {
    throw new Error(
      'Invalid environment configuration: AI_API_KEY, AI_BASE_URL, and AI_MODEL are required for openai-compatible AI_PROVIDER',
    );
  }

  return parsed.data;
}
