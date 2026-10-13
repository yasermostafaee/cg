import { describe, expect, it } from 'vitest';
import {
  defaultFixedLayerBank,
  fixedBankSlots,
  isLayerVisible,
  isLowBankLayer,
  isUnappliedAllShownBank,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import { bringInUnappliedBanks, type BankBringInDeps } from '../src/bank-bring-in.js';

/**
 * 🔴 `RELEASE-091-01` §7 (`B-291`) — ONE ROUND of the bring-in, with its reads and writes injected:
 * the owner's installed station came up showing every row, and a bank no operator ever applied is
 * brought to five template rows and five beds, plus every occupied row, once.
 */

/** A first-run bank from before `FIELD-FIXES-01` I: every row of both bands an explicit `true`. */
function oldShape(channel: number): FixedLayerBank {
  const base = defaultFixedLayerBank();
  const ticked = (bed: boolean): Record<string, boolean> =>
    Object.fromEntries(
      fixedBankSlots(base)
        .filter(({ layer }) => isLowBankLayer(base, layer) === bed)
        .map(({ layer }) => [String(layer), true]),
    );
  return {
    ...base,
    channel,
    visibility: ticked(false),
    low: { ...base.low, visibility: ticked(true) },
  };
}

const shown = (bank: FixedLayerBank): number[] =>
  fixedBankSlots(bank)
    .filter(({ layer }) => isLayerVisible(bank, layer))
    .map(({ layer }) => layer)
    .sort((a, b) => b - a);

interface Harness {
  deps: BankBringInDeps;
  banks: FixedLayerBank[];
  applied: FixedLayerBank[][];
  persisted: number;
  lines: string[];
}

function harness(
  start: FixedLayerBank[],
  read: (channel: number) => {
    state: 'occupied' | 'empty' | 'unknown';
    layers: { layer: number }[];
  },
  opts: { refuse?: boolean; changeDuringRead?: (h: Harness) => void } = {},
): Harness {
  const h: Harness = {
    deps: null as unknown as BankBringInDeps,
    banks: start,
    applied: [],
    persisted: 0,
    lines: [],
  };
  h.deps = {
    banks: () => h.banks,
    occupancy: (channel) => {
      opts.changeDuringRead?.(h);
      return Promise.resolve(read(channel));
    },
    apply: (next) => {
      if (opts.refuse === true)
        return { ok: false, reason: 'untick-occupied', message: 'occupied' };
      h.applied.push([...next]);
      h.banks = [...next];
      return { ok: true };
    },
    persist: () => {
      h.persisted += 1;
    },
    log: (line) => h.lines.push(line),
  };
  return h;
}

describe('RELEASE-091-01 §7 — a bank no operator applied is brought to five rows once', () => {
  it('🔴 an old-shape bank on a channel that reads empty but for layer 90 shows 99–95, 90 and 59–55, and is persisted', async () => {
    const h = harness([oldShape(2)], () => ({ state: 'occupied', layers: [{ layer: 90 }] }));
    expect(isUnappliedAllShownBank(h.banks[0] as FixedLayerBank)).toBe(true);
    expect(await bringInUnappliedBanks(h.deps)).toBe('applied');
    expect(h.applied).toHaveLength(1);
    // CONTROL — the occupied row 90 stays shown.
    expect(shown(h.banks[0] as FixedLayerBank)).toEqual([
      99, 98, 97, 96, 95, 90, 59, 58, 57, 56, 55,
    ]);
    expect(h.persisted).toBe(1);
    expect(h.lines.join('\n')).toMatch(
      /channel 2 .* now shows 99, 98, 97, 96, 95, 90, 59, 58, 57, 56, 55/,
    );
    // Once: the result can never match again, so the next round does nothing.
    expect(isUnappliedAllShownBank(h.banks[0] as FixedLayerBank)).toBe(false);
    expect(await bringInUnappliedBanks(h.deps)).toBe('nothing');
    expect(h.applied).toHaveLength(1);
  });

  it('CONTROL — while the channel cannot be read, nothing changes and nothing is written', async () => {
    const h = harness([oldShape(1)], () => ({ state: 'unknown', layers: [] }));
    expect(await bringInUnappliedBanks(h.deps)).toBe('waiting');
    expect(h.applied).toEqual([]);
    expect(h.persisted).toBe(0);
  });

  it('CONTROL — a bank an operator applied (it carries a false key) is never touched', async () => {
    const applied = oldShape(1);
    const h = harness([{ ...applied, visibility: { ...applied.visibility, '80': false } }], () => ({
      state: 'empty',
      layers: [],
    }));
    expect(await bringInUnappliedBanks(h.deps)).toBe('nothing');
    expect(h.applied).toEqual([]);
  });

  it('a change applied while the channel was being read stands: this round applies nothing', async () => {
    const h = harness([oldShape(1)], () => ({ state: 'empty', layers: [] }), {
      changeDuringRead: (x) => {
        const b = x.banks[0] as FixedLayerBank;
        x.banks = [{ ...b, visibility: { ...b.visibility, '81': false } }];
      },
    });
    expect(await bringInUnappliedBanks(h.deps)).toBe('waiting');
    expect(h.applied).toEqual([]);
  });

  it('a refusal from the validated door changes nothing, and is said on the log', async () => {
    const h = harness([oldShape(1)], () => ({ state: 'empty', layers: [] }), { refuse: true });
    expect(await bringInUnappliedBanks(h.deps)).toBe('waiting');
    expect(h.persisted).toBe(0);
    expect(h.lines.join('\n')).toMatch(/refused \(untick-occupied\)/);
  });

  it('a bank the rule would leave as it is (every row occupied) is not re-applied round after round', async () => {
    const every = fixedBankSlots(oldShape(1)).map(({ layer }) => ({ layer }));
    const h = harness([oldShape(1)], () => ({ state: 'occupied', layers: every }));
    expect(await bringInUnappliedBanks(h.deps)).toBe('nothing');
    expect(h.applied).toEqual([]);
  });

  it('two channels: only the unapplied one moves', async () => {
    const applied = { ...oldShape(2), visibility: { ...oldShape(2).visibility, '80': false } };
    const h = harness([oldShape(1), applied], () => ({ state: 'empty', layers: [] }));
    expect(await bringInUnappliedBanks(h.deps)).toBe('applied');
    expect(shown(h.banks[0] as FixedLayerBank)).toEqual([99, 98, 97, 96, 95, 59, 58, 57, 56, 55]);
    expect(h.banks[1]).toEqual(applied);
  });
});
