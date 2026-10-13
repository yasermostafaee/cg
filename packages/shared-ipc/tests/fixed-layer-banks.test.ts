import { describe, expect, it } from 'vitest';
import {
  FixedLayerBanksSchema,
  bankForChannel,
  bankInSet,
  bankSetSize,
  firstBank,
  fixedBanksSlots,
  sortBanks,
  type FixedLayerBank,
} from '../src/channels/fixedLayers.js';
import {
  checkSourceCatalogAgainstBanks,
  validateSourceCatalogAgainstBanks,
  type SourceCatalog,
} from '../src/channels/sources.js';
import {
  describeReferencePlace,
  describeTemplateReferences,
  referenceRowName,
} from '../src/channels/templates.js';

/**
 * 🔴 `MULTI-CHANNEL-01` — the list of banks and the helpers every reader of it shares. Each
 * helper is asserted against the single-bank answer it must keep, and the plural one it adds.
 */

function bank(channel: number, overrides: Partial<FixedLayerBank> = {}): FixedLayerBank {
  return { channel, start: 80, count: 20, low: { start: 50, count: 10 }, ...overrides };
}

describe('the list and its order', () => {
  it('one bank per channel — control: two channels parse', () => {
    expect(FixedLayerBanksSchema.safeParse([bank(1), bank(2)]).success).toBe(true);
    expect(FixedLayerBanksSchema.safeParse([bank(1), bank(1)]).success).toBe(false);
    expect(FixedLayerBanksSchema.safeParse([]).success).toBe(true);
  });

  it('channel order, the v1 view, the bank of a channel, every slot', () => {
    const banks = [bank(2), bank(1)];
    expect(sortBanks(banks).map((b) => b.channel)).toEqual([1, 2]);
    // The input is not reordered in place.
    expect(banks.map((b) => b.channel)).toEqual([2, 1]);
    expect(firstBank(banks)?.channel).toBe(1);
    expect(firstBank([])).toBeNull();
    expect(bankForChannel(banks, 2)?.channel).toBe(2);
    expect(bankForChannel(banks, 3)).toBeNull();
    const slots = fixedBanksSlots(banks);
    expect(slots).toHaveLength(60);
    expect(slots[0]).toEqual({ channel: 1, layer: 80 });
    expect(slots.filter((s) => s.channel === 2)).toHaveLength(30);
  });

  it('a BankSet: nothing, one bank, or the list', () => {
    expect(bankInSet(null, 1)).toBeNull();
    expect(bankSetSize(null)).toBe(0);
    expect(bankInSet(bank(1), 1)?.channel).toBe(1);
    // One bank answers only for ITS channel.
    expect(bankInSet(bank(1), 2)).toBeNull();
    expect(bankSetSize(bank(1))).toBe(1);
    expect(bankInSet([bank(1), bank(2)], 2)?.channel).toBe(2);
    expect(bankSetSize([bank(1), bank(2)])).toBe(2);
  });
});

describe('the Live Source band against every bank', () => {
  const catalog = (start: number, end: number): SourceCatalog => ({
    sources: [],
    layerRange: { start, end },
  });

  it('a band clear of both banks passes — control: a band inside channel 2’s rows is refused, naming channel 2', () => {
    expect(checkSourceCatalogAgainstBanks(catalog(60, 79), [bank(1), bank(2)], [])).toEqual({
      ok: true,
    });
    const narrow = bank(2, { start: 85, count: 15, low: { start: 50, count: 10 } });
    const refused = checkSourceCatalogAgainstBanks(
      catalog(60, 86),
      [bank(1, { start: 90, count: 10 }), narrow],
      [],
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe('overlaps-fixed-bank');
      expect(refused.message).toContain('channel 2');
    }
  });

  it('no bank at all is checked against none — as a bank-less station always was', () => {
    expect(() => validateSourceCatalogAgainstBanks(catalog(60, 79), [], [])).not.toThrow();
    // …while the reservation still applies, bank or no bank.
    expect(checkSourceCatalogAgainstBanks(catalog(60, 79), [], [65]).ok).toBe(false);
  });
});

describe('naming a template reference', () => {
  const ref = (
    channel: number,
    layer: number,
  ): { itemId: string; slot: { channel: number; layer: number; server: 'primary' } } => ({
    itemId: `i-${String(channel)}-${String(layer)}`,
    slot: { channel, layer, server: 'primary' },
  });

  it('ONE bank: the wording is exactly what it was', () => {
    expect(describeReferencePlace(ref(1, 99), bank(1))).toBe('on the row “Layer 99” (layer 99)');
    expect(describeReferencePlace(ref(1, 20), bank(1))).toBe(
      "on CasparCG layer 20, which is not one of this station's rows",
    );
    expect(describeReferencePlace(ref(2, 99), bank(1))).toBe(
      "on CasparCG layer 2-99, which is not one of this station's rows",
    );
  });

  it('TWO banks: the row is found in ITS channel’s bank and the layer carries the channel', () => {
    const set = [bank(1), bank(2, { aliases: { '98': 'CLOCK' } })];
    expect(describeReferencePlace(ref(2, 98), set)).toBe('on the row “CLOCK” (layer 2-98)');
    expect(describeReferencePlace(ref(1, 98), set)).toBe('on the row “Layer 98” (layer 1-98)');
    expect(describeReferencePlace(ref(1, 20), set)).toBe(
      "on CasparCG layer 1-20, which is not one of this station's rows",
    );
    expect(referenceRowName(ref(2, 98), set)).toBe('CLOCK');
    expect(referenceRowName(ref(3, 98), set)).toBeNull();
    expect(describeTemplateReferences([ref(2, 98)], set)).toBe(
      "1 row still holds this template — on the row “CLOCK” (layer 2-98). Clear it with the row's own REMOVE first.",
    );
  });
});
