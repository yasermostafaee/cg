import { describe, expect, it } from 'vitest';
import {
  channelIds,
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
    const bank = { channel: 2, low: { start: 1, count: 9 }, start: 70, count: 2 };
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
