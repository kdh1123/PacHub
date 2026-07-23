import pino from 'pino';

export function createLogger(level: string): pino.Logger {
  return pino({
    level,
    redact: {
      paths: [
        'DISCORD_TOKEN',
        'discordToken',
        'token',
        'authorization',
        'req.headers.authorization',
      ],
      censor: '[REDACTED]',
    },
  });
}
