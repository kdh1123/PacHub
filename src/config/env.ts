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
