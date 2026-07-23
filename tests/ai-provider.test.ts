import { describe, expect, it } from 'vitest';

import { createAiProvider } from '../src/ai/client.js';
import { DisabledAiProvider } from '../src/ai/provider.js';
import { loadEnvironment } from '../src/config/env.js';

describe('AI provider configuration', () => {
  it('uses a disabled provider unless explicitly configured', async () => {
    const provider = createAiProvider(
      loadEnvironment({ DISCORD_TOKEN: 'test-token', DISCORD_CLIENT_ID: '1234567890' }),
    );
    expect(provider).toBeInstanceOf(DisabledAiProvider);
    await expect(provider.reviewCode()).resolves.toBeUndefined();
  });

  it('requires all OpenAI-compatible connection settings', () => {
    expect(() =>
      loadEnvironment({
        DISCORD_TOKEN: 'test-token',
        DISCORD_CLIENT_ID: '1234567890',
        AI_PROVIDER: 'openai-compatible',
      }),
    ).toThrow('AI_API_KEY');
  });
});
