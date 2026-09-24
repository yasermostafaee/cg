import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LayerPolicy } from '@cg/caspar-client';
import {
  FixedLayerBanksSchema,
  FixedLayersSetBanksChannel,
  bankForChannel,
  firstBank,
  fixedBanksSlots,
  sortBanks,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import {
  FixedLayersConfigError,
  FixedLayersFileError,
  loadFixedLayerBank,
  loadFixedLayerBanks,
  saveFixedLayerBank,
  saveFixedLayerBanks,
  validateFixedBanks,
  validateFixedBanksChange,
  type SlotOccupancy,
} from '../src/fixed-layers-store.js';

/**
 * 🔴 `MULTI-CHANNEL-01` — **ONE BANK PER DECLARED CHANNEL**: the list's schema, its file, and the
 * per-channel change rules. Every refusal is asserted with the control that passes beside it.
 */

const POLICY = {} as unknown as LayerPolicy;

/** The standard bank on a channel: templates 80–99, beds 50–59, all rows shown. */
function bank(channel: number, overrides: Partial<FixedLayerBank> = {}): FixedLayerBank {
  const shown = (from: number, to: number): Record<string, boolean> => {
    const v: Record<string, boolean> = {};
    for (let l = from; l <= to; l++) v[String(l)] = true;
    return v;
  };
  return {
    channel,
    start: 80,
    count: 20,
    visibility: shown(80, 99),
    low: { start: 50, count: 10, visibility: shown(50, 59) },
    ...overrides,
  };
}

function codeOf(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof FixedLayersConfigError) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error('expected FixedLayersConfigError');
}

describe('the list: one bank per channel', () => {
  it('two channels parse — control: the same channel twice is refused by the schema', () => {
    expect(FixedLayerBanksSchema.safeParse([bank(1), bank(2)]).success).toBe(true);
    const twice = FixedLayerBanksSchema.safeParse([bank(2), bank(2)]);
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0]?.message).toContain('channel 2 is declared twice');
  });

  it('the set door needs at least one bank — control: one bank is accepted', () => {
    expect(FixedLayersSetBanksChannel.request.safeParse({ banks: [] }).success).toBe(false);
    expect(FixedLayersSetBanksChannel.request.safeParse({ banks: [bank(2)] }).success).toBe(true);
  });

  it('channel order everywhere: sorted, the first is the v1 view, the slots follow', () => {
    const banks = [bank(3), bank(1)];
    expect(sortBanks(banks).map((b) => b.channel)).toEqual([1, 3]);
    expect(firstBank(banks)?.channel).toBe(1);
    expect(firstBank([])).toBeNull();
    expect(bankForChannel(banks, 3)?.channel).toBe(3);
    expect(bankForChannel(banks, 2)).toBeNull();
    const slots = fixedBanksSlots(banks);
    // Both banks' slots, each carrying its own channel: 30 rows per bank.
    expect(slots.filter((s) => s.channel === 1)).toHaveLength(30);
    expect(slots.filter((s) => s.channel === 3)).toHaveLength(30);
    expect(slots[0]?.channel).toBe(1);
  });
});

describe('the persisted file', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });
  function tmpFile(name: string): string {
    dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fixed-banks-'));
    return path.join(dir, name);
  }

  it('a v1 file (ONE bank object) reads as a one-entry list', () => {
    const file = tmpFile('v1.json');
    saveFixedLayerBank(file, bank(2, { aliases: { '99': 'LOGO' } }));
    expect(loadFixedLayerBanks(file)).toEqual([bank(2, { aliases: { '99': 'LOGO' } })]);
  });

  it('ONE bank is written as the v1 object, byte for byte — the file a one-channel station always had', () => {
    const single = tmpFile('single.json');
    const legacy = tmpFile('legacy.json');
    saveFixedLayerBanks(single, [bank(1)]);
    saveFixedLayerBank(legacy, bank(1));
    expect(fs.readFileSync(single, 'utf8')).toBe(fs.readFileSync(legacy, 'utf8'));
    // …so a v1 READER still reads it.
    expect(loadFixedLayerBank(single)).toEqual(bank(1));
  });

  it('two banks are written as `{ banks }` in channel order, and read back — control: a v1 reader refuses that file', () => {
    const file = tmpFile('two.json');
    saveFixedLayerBanks(file, [bank(2), bank(1)]);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { banks: FixedLayerBank[] };
    expect(raw.banks.map((b) => b.channel)).toEqual([1, 2]);
    expect(loadFixedLayerBanks(file)).toEqual([bank(1), bank(2)]);
    // An older build reading this file fails LOUDLY rather than taking one channel of two.
    expect(() => loadFixedLayerBank(file)).toThrow(FixedLayersFileError);
  });

  it('absent → null; a duplicate channel, an empty list, or an old-map entry is a HARD failure', () => {
    expect(loadFixedLayerBanks(tmpFile('missing.json'))).toBeNull();

    const twice = tmpFile('twice.json');
    fs.writeFileSync(twice, JSON.stringify({ banks: [bank(2), bank(2)] }), 'utf8');
    expect(() => loadFixedLayerBanks(twice)).toThrow(/declared twice/);

    const empty = tmpFile('empty.json');
    fs.writeFileSync(empty, JSON.stringify({ banks: [] }), 'utf8');
    expect(() => loadFixedLayerBanks(empty)).toThrow(/declares no channel/);

    const oldMap = tmpFile('old.json');
    fs.writeFileSync(
      oldMap,
      JSON.stringify({ banks: [bank(1), { channel: 2, start: 70, count: 4 }] }),
      'utf8',
    );
    expect(() => loadFixedLayerBanks(oldMap)).toThrow(/OLD layer map/);
  });

  it('an empty set is never written', () => {
    expect(() => saveFixedLayerBanks(tmpFile('never.json'), [])).toThrow(/declares no channel/);
  });
});

describe('validating the set', () => {
  const air = new Set<number>();
  const occupancy = new Map<string, SlotOccupancy>();
  const options = {
    policy: POLICY,
    reservedLayers: [] as number[],
    slotOccupancy: (s: { channel: number; layer: number }): SlotOccupancy =>
      occupancy.get(`${String(s.channel)}:${String(s.layer)}`) ?? 'empty',
    channelHoldsOurAir: (channel: number): boolean => air.has(channel),
  };
  afterEach(() => {
    air.clear();
    occupancy.clear();
  });

  it('boot: every bank is validated, and both banks’ slots are returned', () => {
    const slots = validateFixedBanks([bank(2), bank(1)], options);
    expect(slots).toHaveLength(60);
    expect(new Set(slots.map((s) => s.channel))).toEqual(new Set([1, 2]));
  });

  it('ADD a channel — accepted; a row it arrives with hidden must be provably empty (control: an empty one is accepted)', () => {
    expect(validateFixedBanksChange([bank(1)], [bank(1), bank(2)], options)).toHaveLength(60);
    const hidden = bank(2, { visibility: { ...bank(2).visibility, '99': false } });
    occupancy.set('2:99', 'unknown');
    expect(codeOf(() => validateFixedBanksChange([bank(1)], [bank(1), hidden], options)).code).toBe(
      'untick-unknown',
    );
    occupancy.set('2:99', 'empty');
    expect(validateFixedBanksChange([bank(1)], [bank(1), hidden], options)).toHaveLength(60);
  });

  it('REMOVE a channel — refused while ours holds air on it, in the B-269 sentence; control: accepted once it does not', () => {
    air.add(2);
    const refused = codeOf(() => validateFixedBanksChange([bank(1), bank(2)], [bank(1)], options));
    expect(refused).toEqual({
      code: 'channel-change-refused',
      message: 'Something of ours is still on air on channel 2 — take it off air first.',
    });
    air.clear();
    expect(validateFixedBanksChange([bank(1), bank(2)], [bank(1)], options)).toHaveLength(30);
  });

  it('air on a channel that STAYS does not stop another from being removed', () => {
    air.add(1);
    expect(validateFixedBanksChange([bank(1), bank(2)], [bank(1)], options)).toHaveLength(30);
  });

  it('EDIT a channel keeps every single-bank rule — control: the same edit on a new channel is a fresh install', () => {
    const moved = bank(2, { start: 81, count: 19, visibility: {} });
    // `start` is fixed at install on a channel that is already declared…
    expect(
      codeOf(() => validateFixedBanksChange([bank(1), bank(2)], [bank(1), moved], options)).code,
    ).toBe('renumber-refused');
    // …while a channel the set does not yet declare may be declared with any legal shape.
    expect(validateFixedBanksChange([bank(1)], [bank(1), moved], options)).toHaveLength(59);
  });

  it('with no `channelHoldsOurAir` a removal is refused — fail closed', () => {
    const { channelHoldsOurAir: _omit, ...blind } = options;
    void _omit;
    expect(codeOf(() => validateFixedBanksChange([bank(1), bank(2)], [bank(2)], blind)).code).toBe(
      'channel-change-refused',
    );
  });
});
