import { describe, expect, it } from 'vitest';
import type { ChannelOutputCheck } from '@cg/shared-ipc';
import { describeMissingOutput, describeUnknownOutput } from '../src/output-check.js';

/**
 * `DESKTOP-APPS-01-D` g — the bridge's stderr line for an output `INFO` cannot judge is a plain
 * note, never the 🔴 alarm. The check is the shape the fork's channel 1 produced on
 * `192.168.21.111` (`running: pgm, ndi`; `decklink` device 1 and `ffmpeg` declared).
 */
const forkCheck: ChannelOutputCheck = {
  channel: 1,
  declared: [
    { kind: 'pgm' },
    { kind: 'decklink', device: '1', embeddedAudio: true },
    { kind: 'ffmpeg' },
    { kind: 'ndi' },
  ],
  running: [
    { port: 540, kind: 'pgm' },
    { port: 900, kind: 'ndi' },
  ],
  missing: [],
  unknown: [
    { kind: 'decklink', declared: 1, running: 0, devices: ['1'] },
    { kind: 'ffmpeg', declared: 1, running: 0, devices: [] },
  ],
  observedAt: '2026-09-23T15:37:00.000Z',
};

describe('DESKTOP-APPS-01-D g — describeUnknownOutput', () => {
  it('says UNKNOWN, names the non-stock consumer, and carries no alarm', () => {
    const line = describeUnknownOutput('A', forkCheck);
    expect(line).toContain('decklink (device 1), ffmpeg');
    expect(line).toContain('lists pgm, which stock CasparCG does not ship');
    expect(line).toContain('Output UNKNOWN, not alarmed');
    expect(line).not.toMatch(/OUTPUT MISSING|🔴/);
  });

  it('control — a missing output on a stock list keeps the 🔴 alarm line', () => {
    const { unknown: _unknown, ...stock } = forkCheck;
    const line = describeMissingOutput('A', {
      ...stock,
      running: [{ port: 900, kind: 'ndi' }],
      missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['1'] }],
    });
    expect(line).toContain('🔴 CHANNEL 1 OUTPUT MISSING');
  });
});
