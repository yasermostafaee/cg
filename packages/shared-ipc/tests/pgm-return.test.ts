import { describe, expect, it } from 'vitest';
import {
  PgmReturnStatusSchema,
  PgmReturnTicketChannel,
  pgmAudioPath,
  pgmReturnPath,
} from '../src/index.js';

describe('R-104 / R-118 — programme-return wire contract', () => {
  it('keeps legacy A and B paths and qualifies additional engines', () => {
    expect(pgmReturnPath(3)).toBe('/pgm/3');
    expect(pgmAudioPath(3)).toBe('/pgm/3/sound');
    expect(pgmReturnPath(3, 'B')).toBe('/pgm/B/3');
    expect(pgmAudioPath(3, 'B')).toBe('/pgm/B/3/sound');
    expect(pgmReturnPath(3, 'C')).toBe('/pgm/C/3');
    expect(pgmAudioPath(3, 'D')).toBe('/pgm/D/3/sound');
  });

  it('accepts legacy payloads and a verified mapping key for each added engine', () => {
    expect(PgmReturnStatusSchema.parse({ channel: 1, state: 'live' })).toEqual({
      channel: 1,
      state: 'live',
    });
    expect(PgmReturnStatusSchema.parse({ engine: 'B', channel: 1, state: 'live' }).engine).toBe(
      'B',
    );
    expect(
      PgmReturnTicketChannel.request.parse({ engine: 'C', channel: 1, resourceKey: 'mapping-c' }),
    ).toEqual({ engine: 'C', channel: 1, resourceKey: 'mapping-c' });
    expect(
      PgmReturnTicketChannel.request.safeParse({
        engine: 'E',
        channel: 1,
        resourceKey: 'mapping-e',
      }).success,
    ).toBe(false);
  });
});
