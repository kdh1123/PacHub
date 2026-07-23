import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, 'DISCORD_CLIENT_ID must be a Discord snowflake'),
  DISCORD_GUILD_ID: z
    .string()
    .regex(/^\d+$/, 'DISCORD_GUILD_ID must be a Discord snowflake')
    .optional(),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN cannot be empty').optional(),
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

  return parsed.data;
}
