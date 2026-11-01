import { describe, expect, it } from 'vitest';
import {
  PgmReturnStatusSchema,
  PgmReturnTicketChannel,
  pgmAudioPath,
  pgmReturnPath,
} from '../src/index.js';

describe('R-104 — A/B programme-return wire contract', () => {
  it('keeps the legacy A paths and gives B a distinct engine-qualified path', () => {
    expect(pgmReturnPath(3)).toBe('/pgm/3');
    expect(pgmAudioPath(3)).toBe('/pgm/3/sound');
    expect(pgmReturnPath(3, 'B')).toBe('/pgm/B/3');
    expect(pgmAudioPath(3, 'B')).toBe('/pgm/B/3/sound');
  });

  it('accepts legacy A payloads but rejects any engine beyond the supported A/B pair', () => {
    expect(PgmReturnStatusSchema.parse({ channel: 1, state: 'live' })).toEqual({
      channel: 1,
      state: 'live',
    });
    expect(PgmReturnStatusSchema.parse({ engine: 'B', channel: 1, state: 'live' }).engine).toBe(
      'B',
    );
    expect(PgmReturnTicketChannel.request.safeParse({ engine: 'C', channel: 1 }).success).toBe(
      false,
    );
  });
});
