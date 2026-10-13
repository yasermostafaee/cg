import { describe, expect, it } from 'vitest';
import {
  grantsChannel,
  normalizePlayoutChannels,
  PlayoutChannelsSchema,
  PlayoutPrincipalSchema,
} from '../src/channels/auth.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` A3 (Playout `2.9.2` §2, §9) — **`cg_channels` IN EVERY SHAPE A PLAYOUT HAS
 * SENT, READ AS `"*"` OR A LIST.** `"*"`; an explicit list, which from `2.9.2` even an admin's token
 * carries on a Playout whose CG licence caps the channels; and the lone grant OBJECT that D8 answered
 * for a multi-channel account before `2.9.2`.
 */

const CH1 = { host: '127.0.0.1', channel: 1 };
const CH2 = { host: '192.0.2.10', channel: 2 };

describe('the three shapes', () => {
  it('`"*"` stays `"*"`', () => {
    expect(normalizePlayoutChannels('*')).toBe('*');
    expect(PlayoutChannelsSchema.parse('*')).toBe('*');
  });

  it('an explicit list stays that list — an empty one included', () => {
    expect(PlayoutChannelsSchema.parse([CH1, CH2])).toEqual([CH1, CH2]);
    expect(PlayoutChannelsSchema.parse([])).toEqual([]);
  });

  it('🔴 a lone grant OBJECT is a list of one', () => {
    expect(normalizePlayoutChannels(CH2)).toEqual([CH2]);
    expect(PlayoutChannelsSchema.parse(CH2)).toEqual([CH2]);
    expect(grantsChannel(PlayoutChannelsSchema.parse(CH2), ['192.0.2.10'], 2)).toBe(true);
  });

  it('anything else is still refused — the normalizer widens three shapes, not the contract', () => {
    for (const bad of [null, undefined, 'all', 7, { host: '', channel: 1 }, [{ channel: 1 }], {}]) {
      expect(normalizePlayoutChannels(bad), JSON.stringify(bad)).toBeNull();
      expect(PlayoutChannelsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('a principal carries whichever shape arrived as `"*"` or a list', () => {
    const principal = {
      name: 'مدیر ایستگاه',
      sub: 'u-1',
      roles: ['station-admin', 'operator', 'viewer'],
      expiresAt: '2026-09-30T20:00:00.000Z',
      nameTruncated: false,
    };
    expect(PlayoutPrincipalSchema.parse({ ...principal, channels: '*' }).channels).toBe('*');
    expect(PlayoutPrincipalSchema.parse({ ...principal, channels: [CH1] }).channels).toEqual([CH1]);
    expect(PlayoutPrincipalSchema.parse({ ...principal, channels: CH1 }).channels).toEqual([CH1]);
  });
});
