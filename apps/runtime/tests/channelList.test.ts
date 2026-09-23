import { describe, expect, it } from 'vitest';
import {
  channelIds,
  channelNames,
  resolveSelectedChannel,
} from '../src/renderer/features/channels/channelList.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **the channel list is a LIST, shaped to be
 * filled from an API — not the prototype's fixed count and not one literal tab.**
 *
 * The app's only channel authorities today are the fixed bank (`FixedLayerBankSchema.channel`,
 * one bank, one channel) and the bridge's per-channel settings (`channelSettings.settings`, one
 * entry per declared channel). The list is their UNION, so the day a channel-discovery call
 * exists it is one more source in this function and nothing else changes shape. ⚠ No contract is
 * invented here: both inputs are channels the bridge already publishes (`design.md` §4, owner
 * answer A3 — the three real gaps are filed, not closed).
 */
describe('channelIds — the union of every channel the bridge already names', () => {
  it('with nothing declared, the documented default channel stands alone', () => {
    expect(channelIds(null, { settings: [], observed: [] })).toEqual([1]);
  });

  it('the bank and the settings are unioned, de-duplicated and sorted', () => {
    const settings = {
      settings: [
        { channel: 3, raster: { width: 1920, height: 1080 } },
        { channel: 1, raster: { width: 1920, height: 1080 } },
      ],
      observed: [],
    };
    const bank = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 2 };
    expect(channelIds(bank, settings)).toEqual([1, 2, 3]);
    // The bank's channel already declared in settings appears ONCE.
    expect(channelIds({ ...bank, channel: 3 }, settings)).toEqual([1, 3]);
  });

  it('an OBSERVED channel with no stored settings is not a declared channel', () => {
    // `observed` is what the server reported for a channel the bridge asked about; the list of
    // channels is what is DECLARED. Reading observations as declarations would let a server
    // reading invent a tab.
    const settings = {
      settings: [{ channel: 1, raster: { width: 1920, height: 1080 } }],
      observed: [{ channel: 2, mode: '1080p5000', raster: { width: 1920, height: 1080 } }],
    };
    expect(channelIds(null, settings)).toEqual([1]);
  });
});

/*
  🔴 `CHANNEL-AUTHORITY-01` / `R-062` gap 2 — THE DISCOVERY ANSWER IS READ FIRST, AND ITS
  `declared` SUBSET IS THE LIST. The station on channel 2; the Playout's catalogue also names its
  own programme channel 1, which the principal is even PERMITTED — and which is not this station's.
*/
describe('channelIds — the discovery answer first, declared channels only', () => {
  const bank = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 };
  const settings = {
    settings: [{ channel: 2, raster: { width: 1920, height: 1080 } }],
    observed: [],
  };
  const discovered = {
    channels: [
      {
        channel: 1,
        named: { id: 'apasai', name: 'آپاسای' },
        declared: false,
        permitted: true,
        sources: ['catalogue' as const],
      },
      {
        channel: 2,
        named: { id: 'cg-test2', name: 'کانال دوم (تست CG)' },
        declared: true,
        permitted: true,
        sources: ['catalogue' as const, 'bank' as const, 'channel-settings' as const],
      },
    ],
  };

  it('a catalogue-only channel is NOT on the list — control: the declared channel is', () => {
    const listed = channelIds(bank, settings, { kind: 'off' }, discovered);
    expect(listed, 'the declared channel is missing — the instrument is dead').toContain(2);
    expect(listed).not.toContain(1);
    expect(listed).toEqual([2]);
  });

  it('it stays off the list for a principal granted it', () => {
    const cgOp2 = {
      kind: 'signed-in' as const,
      principal: {
        name: 'نرگس کریمی',
        sub: 'u-8826',
        roles: ['operator', 'viewer'],
        channels: [
          { host: '127.0.0.1', channel: 1 },
          { host: '127.0.0.1', channel: 2 },
        ],
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        nameTruncated: false,
      },
      // The bridge's own answer — declared ∩ granted — which is channel 2 alone.
      permittedChannels: [2],
    };
    expect(channelIds(bank, settings, cgOp2, discovered)).toEqual([2]);
  });

  it('an answer that declares nothing falls back to the bank and settings, as before', () => {
    expect(channelIds(bank, settings, { kind: 'off' }, { channels: [] })).toEqual([2]);
    expect(channelIds(bank, settings, { kind: 'off' }, null)).toEqual([2]);
  });

  it('channelNames names only DECLARED channels — control: the declared one is named', () => {
    const names = channelNames(discovered);
    expect(names.get(2)).toBe('کانال دوم (تست CG)');
    expect(names.has(1), 'a catalogue-only channel was given a label').toBe(false);
    expect(channelNames(null).size).toBe(0);
  });
});

describe('resolveSelectedChannel — the choice is keyed by id and falls back honestly', () => {
  it('an operator choice that is in the list wins', () => {
    expect(resolveSelectedChannel([1, 2, 3], 2, null)).toBe(2);
  });

  it('no choice yet: the bank’s channel, because it is the console’s channel authority today', () => {
    expect(resolveSelectedChannel([1, 2, 3], null, 2)).toBe(2);
  });

  it('a choice for a channel that has since vanished falls back to the bank, then the first', () => {
    expect(resolveSelectedChannel([1, 3], 2, 3)).toBe(3);
    expect(resolveSelectedChannel([1, 3], 2, null)).toBe(1);
    // …and a bank naming a channel the list does not carry cannot be selected either.
    expect(resolveSelectedChannel([1, 3], null, 9)).toBe(1);
  });
});
