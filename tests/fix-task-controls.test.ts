import { describe, expect, it } from 'vitest';
import { createFixTaskControls } from '../src/discord/commands/fixTaskControls.js';

describe('fix task control command definitions', () => {
  it('registers status and cancel commands', () => {
    const controls = createFixTaskControls({} as never, {} as never, {} as never);
    expect(controls.status.data.name).toBe('fix-status');
    expect(controls.cancel.data.name).toBe('fix-cancel');
  });
});
