import { describe, expect, it, vi } from 'vitest';

import { pingCommand } from '../src/discord/commands/ping.js';

describe('/ping', () => {
  it('replies with health, latency, environment, and version', async () => {
    const interaction = {
      reply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await pingCommand.execute(interaction as never, 'test');

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Checking bot status…',
      ephemeral: true,
    });
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('환경: test'));
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('버전: 0.1.0'));
  });
});
