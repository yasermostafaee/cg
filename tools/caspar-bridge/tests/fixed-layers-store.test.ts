import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAYER_POLICY, LayerManager, type LayerSlot } from '@cg/caspar-client';
import {
  FIXED_LAYERS_SET_CONFIG_REASONS,
  defaultFixedLayerBank,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import {
  FixedLayersConfigError,
  FixedLayersFileError,
  MAX_FIXED_LAYER,
  loadFixedLayerBank,
  saveFixedLayerBank,
  validateFixedBank,
  validateFixedBankChange,
  type FixedLayersErrorCode,
} from '../src/fixed-layers-store.js';
import { isFixedSlotBusy } from '../src/caspar-runtime.js';

// S2 (compile-time half) — the validator's code union and the wire's reason
// union are ONE definition; these two assignments break the BUILD on any drift,
// in both directions.
const _wireCoversValidator: readonly FixedLayersErrorCode[] = FIXED_LAYERS_SET_CONFIG_REASONS;
const _validatorCoversWire: readonly (typeof FIXED_LAYERS_SET_CONFIG_REASONS)[number][] =
  [] as FixedLayersErrorCode[];
void _wireCoversValidator;
void _validatorCoversWire;

/**
 * R-021 stage 1 / R-028 — the bank validators + persistence. Every refusal
 * carries a stable code AND a message naming what the operator must fix (an
 * overlap names BOTH ranges; an untick refusal names the layer and
 * distinguishes OCCUPIED from UNKNOWN) — asserted on message CONTENT, not
 * just the code (R-028 task 2.6). The loader's present-but-unusable → THROW
 * behaviour (never warn-and-ignore) is the deliberate divergence from
 * connection-store documented in the module header.
 */

const POLICY = DEFAULT_LAYER_POLICY;

function bank(overrides: Partial<FixedLayerBank> = {}): FixedLayerBank {
  return { channel: 1, start: 70, count: 10, ...overrides };
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

describe('validateFixedBank', () => {
  it('accepts the default bank (70–79) against the default policy and returns its slots', () => {
    const slots = validateFixedBank(bank(), { policy: POLICY, reservedLayers: [] });
    expect(slots).toHaveLength(10);
    expect(slots[0]).toEqual({ channel: 1, layer: 70 });
    expect(slots[9]).toEqual({ channel: 1, layer: 79 });
  });

  it('T8 — overlap with a policy range is refused, naming BOTH ranges', () => {
    const { code, message } = codeOf(() =>
      validateFixedBank(bank({ start: 65, count: 10 }), { policy: POLICY, reservedLayers: [] }),
    );
    expect(code).toBe('overlaps-policy');
    expect(message).toContain('65–74'); // the bank's range
    expect(message).toContain('60–69'); // the 'custom' policy range it hits
    expect(message).toContain('custom');
  });

  // ⚠ NOT "the C-015 Live Source seam", which is what this test used to call it.
  // `reservedLayers` is the range the company's PLAYOUT SYSTEM owns — a fence away
  // from a FOREIGN owner. A Live Source layer is the inverse: one the bridge owns,
  // tracked in its own ledger (`live-layers.ts`, design.md §4). The old name is how
  // the disjointness half of C-015 came to read as the whole of it.
  it('T9 — overlap with reservedLayers (the foreign PLAYOUT range) is refused, naming both', () => {
    const { code, message } = codeOf(() =>
      validateFixedBank(bank(), { policy: POLICY, reservedLayers: [72, 73] }),
    );
    expect(code).toBe('overlaps-reserved');
    expect(message).toContain('70–79');
    expect(message).toContain('72, 73');
  });

  it('T10 — start+count-1 beyond the ceiling is refused, naming it', () => {
    // The ceiling MOVED from 89 to 99 (owner decision: the candidate bank is the full
    // 70–99). `logo-bug`'s dynamic range moved out of 90–99 to 40–49 in the same
    // change, so the space is genuinely free rather than merely re-declared free —
    // T10b below is what pins that pairing.
    const { code, message } = codeOf(() =>
      validateFixedBank(bank({ start: 95, count: 10 }), { policy: POLICY, reservedLayers: [] }),
    );
    expect(code).toBe('exceeds-ceiling');
    expect(message).toContain(String(MAX_FIXED_LAYER));
    expect(message).toContain('95–104');
  });

  it('T10b — the FULL 70–99 bank is accepted, and every dynamic range stays disjoint', () => {
    /*
      The two constants had to move together, and this is the assertion that keeps them
      that way. Raising the ceiling alone would leave a bank the validator accepts here
      and then refuses on `overlaps-policy`; moving `logo-bug` alone would leave the
      ceiling blocking the range it freed. Either half on its own is a config nobody can
      boot with — and if someone "fixed" that by weakening the overlap check instead, the
      bank would share layers with automatic allocation, which is the cross-subsystem
      destruction the disjointness rules exist to prevent.
    */
    const slots = validateFixedBank(
      { channel: 1, start: 70, count: 30 },
      {
        policy: DEFAULT_LAYER_POLICY,
        reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69],
      },
    );
    expect(slots).toHaveLength(30);
    expect(slots[0]).toEqual({ channel: 1, layer: 70 });
    expect(slots[29]).toEqual({ channel: 1, layer: 99 });
    // Stated independently of the bank, so a future range edit that collides is caught
    // here rather than by a bridge that will not start.
    for (const [type, [low, high]] of Object.entries(DEFAULT_LAYER_POLICY)) {
      expect(
        high < 70 || low > 99,
        `'${type}' ${String(low)}–${String(high)} must not overlap 70–99`,
      ).toBe(true);
    }
  });

  it('the BUILT-IN DEFAULT bank itself validates — the bank a fresh station boots with', () => {
    // Not a hand-written twin of the default: the default itself, run through
    // the validator every boot runs it through. A machine with no config file
    // gets this, so a policy or ceiling edit that made it unbootable would
    // brick every unconfigured station — including the plant server.
    const slots = validateFixedBank(defaultFixedLayerBank(), {
      policy: DEFAULT_LAYER_POLICY,
      reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69],
    });
    expect(slots).toHaveLength(30);
    expect(slots[0]).toEqual({ channel: 1, layer: 70 });
    expect(slots[29]).toEqual({ channel: 1, layer: 99 });
  });

  it('T11 — an alias key outside the bank is refused, naming the key', () => {
    const { code, message } = codeOf(() =>
      validateFixedBank(bank({ aliases: { '69': 'clock' } }), {
        policy: POLICY,
        reservedLayers: [],
      }),
    );
    expect(code).toBe('alias-out-of-bank');
    expect(message).toContain('69');
  });
});

describe('validateFixedBankChange (R-028 — the ceiling is fixed; live changes are ticks + aliases)', () => {
  const ALL_EMPTY = (): 'empty' => 'empty';

  it('alias and visibility changes over provably-empty layers are accepted', () => {
    const slots = validateFixedBankChange(
      bank(),
      bank({ aliases: { '71': 'ساعت' }, visibility: { '72': false } }),
      { policy: POLICY, reservedLayers: [], slotOccupancy: ALL_EMPTY },
    );
    expect(slots).toHaveLength(10);
  });

  it('R-028 (2.1) — grow AND shrink are BOTH refused mid-session: the ceiling is fixed at install', () => {
    for (const nextCount of [12, 8]) {
      const { code, message } = codeOf(() =>
        validateFixedBankChange(bank(), bank({ count: nextCount }), {
          policy: POLICY,
          reservedLayers: [],
          slotOccupancy: ALL_EMPTY,
        }),
      );
      expect(code).toBe('resize-refused');
      expect(message).toContain('10'); // the current ceiling
      expect(message).toContain(String(nextCount)); // the refused one
      expect(message).toContain('fixed at install');
      expect(message).toContain('restart the bridge'); // the only path that changes it
    }
  });

  it('T14 — moving start or channel mid-session is refused with their codes', () => {
    expect(
      codeOf(() =>
        validateFixedBankChange(bank(), bank({ start: 71 }), {
          policy: POLICY,
          reservedLayers: [],
          slotOccupancy: ALL_EMPTY,
        }),
      ).code,
    ).toBe('renumber-refused');
    expect(
      codeOf(() =>
        validateFixedBankChange(bank(), bank({ channel: 2 }), {
          policy: POLICY,
          reservedLayers: [],
          slotOccupancy: ALL_EMPTY,
        }),
      ).code,
    ).toBe('channel-change-refused');
  });

  it('R-028 (2.3) — unticking an OCCUPIED layer is refused, naming the layer and the remedy', () => {
    const { code, message } = codeOf(() =>
      validateFixedBankChange(bank(), bank({ visibility: { '74': false } }), {
        policy: POLICY,
        reservedLayers: [],
        slotOccupancy: (slot: LayerSlot) => (slot.layer === 74 ? 'occupied' : 'empty'),
      }),
    );
    expect(code).toBe('untick-occupied');
    expect(message).toContain('74');
    expect(message).toContain('OCCUPIED');
    expect(message).toContain('remove its template first');
  });

  it('R-028 (2.3) — unticking with UNKNOWN occupancy is refused too (fail closed), distinguishably', () => {
    const { code, message } = codeOf(() =>
      validateFixedBankChange(bank(), bank({ visibility: { '74': false } }), {
        policy: POLICY,
        reservedLayers: [],
        slotOccupancy: () => 'unknown',
      }),
    );
    expect(code).toBe('untick-unknown');
    expect(message).toContain('74');
    expect(message).toContain('UNKNOWN');
    expect(message).toContain('never treated as empty');
    // The two refusals must be DISTINGUISHABLE (2.6) — different code, and a
    // message that names the missing evidence rather than claiming occupancy.
    expect(message).not.toContain('OCCUPIED (');
  });

  it('a layer that is ALREADY hidden stays hidden without re-adjudication', () => {
    // Occupancy callback would refuse everything — but the tick is not
    // CHANGING, so it must not be consulted for already-hidden layers.
    const hidden = bank({ visibility: { '74': false } });
    const slots = validateFixedBankChange(
      hidden,
      bank({ visibility: { '74': false, '75': true } }),
      {
        policy: POLICY,
        reservedLayers: [],
        slotOccupancy: () => 'unknown',
      },
    );
    expect(slots).toHaveLength(10);
  });

  it('R-028 (2.5) — reserved-range overlap is refused AT CHANGE too, naming both ranges', () => {
    const { code, message } = codeOf(() =>
      validateFixedBankChange(bank(), bank({ aliases: { '75': 'x' } }), {
        policy: POLICY,
        reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 78, 79],
        slotOccupancy: ALL_EMPTY,
      }),
    );
    expect(code).toBe('overlaps-reserved');
    expect(message).toContain('70–79'); // the candidate ceiling
    expect(message).toContain('60–69'); // the reserved playout range, as a RANGE
    expect(message).toContain('78, 79'); // the intersecting layers
  });
});

describe('R-028 — visibility shape validation', () => {
  it('a visibility key outside the bank is refused, naming the key', () => {
    const { code, message } = codeOf(() =>
      validateFixedBank(bank({ visibility: { '69': false } }), {
        policy: POLICY,
        reservedLayers: [],
      }),
    );
    expect(code).toBe('visibility-out-of-bank');
    expect(message).toContain('69');
  });

  it('R-028 (2.2) — an UNTICKED layer is still among the validated slots: hiding never unfences', () => {
    const slots = validateFixedBank(bank({ visibility: { '72': false, '73': false } }), {
      policy: POLICY,
      reservedLayers: [],
    });
    // The whole ceiling is returned — the LayerManager fences every slot the
    // validator yields, so an unticked layer can never re-enter the
    // allocatable pool (visibility is display-only by construction).
    expect(slots).toHaveLength(10);
    expect(slots.map((s) => s.layer)).toContain(72);
    expect(slots.map((s) => s.layer)).toContain(73);
  });
});

describe('isFixedSlotBusy (S10) — the REAL busy predicate, driven directly', () => {
  const SLOT = { channel: 1, layer: 72 };

  it('answers false with no binding and no retained intent', () => {
    const lm = new LayerManager({ fixed: [SLOT] });
    expect(
      isFixedSlotBusy(SLOT, {
        fixedBinding: (s) => lm.fixedBinding(s),
        retainedSlotKeys: new Set(),
      }),
    ).toBe(false);
  });

  it('answers true when the LayerManager holds a fixed binding for the slot', () => {
    const lm = new LayerManager({ fixed: [SLOT] });
    lm.bindFixed(SLOT, 'clock');
    expect(
      isFixedSlotBusy(SLOT, {
        fixedBinding: (s) => lm.fixedBinding(s),
        retainedSlotKeys: new Set(),
      }),
    ).toBe(true);
  });

  it('answers true when retained intent points at the slot', () => {
    const lm = new LayerManager({ fixed: [SLOT] });
    expect(
      isFixedSlotBusy(SLOT, {
        fixedBinding: (s) => lm.fixedBinding(s),
        retainedSlotKeys: new Set(['1:72']),
      }),
    ).toBe(true);
  });
});

describe('persistence (T15)', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function tmpFile(name: string): string {
    dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fixed-layers-'));
    return path.join(dir, name);
  }

  it('save/load round-trip', () => {
    const file = tmpFile('bank.json');
    const b = bank({ aliases: { '72': 'ساعت' } });
    saveFixedLayerBank(file, b);
    expect(loadFixedLayerBank(file)).toEqual(b);
  });

  it('absent file → null (the normal no-bank case)', () => {
    expect(loadFixedLayerBank(tmpFile('missing.json'))).toBeNull();
  });

  it('bad JSON → throws (never warn-and-ignore)', () => {
    const file = tmpFile('garbage.json');
    fs.writeFileSync(file, 'not json {', 'utf8');
    expect(() => loadFixedLayerBank(file)).toThrow(FixedLayersFileError);
  });

  it('schema-invalid file → throws, naming the file', () => {
    const file = tmpFile('invalid.json');
    fs.writeFileSync(file, JSON.stringify({ channel: 0, start: -1 }), 'utf8');
    try {
      loadFixedLayerBank(file);
      expect.unreachable('loader must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FixedLayersFileError);
      expect((err as Error).message).toContain('invalid.json');
    }
  });
});
