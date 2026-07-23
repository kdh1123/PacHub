import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';

describe('loadEnvironment', () => {
  it('accepts valid required values and defaults optional values', () => {
    const env = loadEnvironment({ DISCORD_TOKEN: 'test-token', DISCORD_CLIENT_ID: '1234567890' });

    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('rejects missing Discord credentials without revealing values', () => {
    expect(() => loadEnvironment({ DISCORD_TOKEN: 'private-token' })).toThrow('DISCORD_CLIENT_ID');
  });
});
