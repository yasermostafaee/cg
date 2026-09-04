import { describe, expect, it } from 'vitest';
import type { ChannelOutputCheck } from '@cg/shared-ipc';
import { describeMissingOutput } from '../src/output-check.js';

/**
 * `C-030` — the bridge's stderr line carries the same two facts the banner does: which
 * addressing form the declaration uses, and where the number comes from. Red-first: written
 * before the words existed, run red on the `C-029` line, then the words were added.
 */
const check: ChannelOutputCheck = {
  channel: 1,
  declared: [{ kind: 'decklink', device: '23487013', embeddedAudio: true }, { kind: 'screen' }],
  running: [
    { port: 500, kind: 'system-audio' },
    { port: 600, kind: 'screen' },
  ],
  missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] }],
  observedAt: '2026-09-04T20:00:00.000Z',
};

describe('C-030 — describeMissingOutput names the addressing form and the log recipe', () => {
  it('calls 23487013 a hardware persistent ID and says how CasparCG reads it', () => {
    const line = describeMissingOutput('A', check);
    expect(line).toContain('hardware persistent ID 23487013');
    expect(line).toMatch(/slot position first/);
  });

  it('calls a small number a slot index', () => {
    const line = describeMissingOutput('A', {
      ...check,
      declared: [{ kind: 'decklink', device: '1' }],
      missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['1'] }],
    });
    expect(line).toContain('slot index 1');
  });

  it('names the startup log, the search string and the brackets', () => {
    const line = describeMissingOutput('A', check);
    expect(line).toMatch(/Decklink devices found/);
    expect(line).toMatch(/\[slot\] \(persistent ID\)/);
  });
});
