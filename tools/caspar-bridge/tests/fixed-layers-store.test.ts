import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAYER_POLICY, LayerManager, type LayerSlot } from '@cg/caspar-client';
import { FIXED_LAYERS_SET_CONFIG_REASONS, type FixedLayerBank } from '@cg/shared-ipc';
import {
  FixedLayersConfigError,
  FixedLayersFileError,
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
 * R-021 stage 1 — the bank validators + persistence. Every refusal carries a
 * stable code AND a message naming what the operator must fix (a1: an overlap
 * names BOTH ranges; e1: a refused shrink names the occupied slot NUMBERS) —
 * asserted on message CONTENT, not just the code. The loader's
 * present-but-unusable → THROW behaviour (never warn-and-ignore) is the
 * deliberate divergence from connection-store documented in the module header.
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

  it('T9 — overlap with reservedLayers (the C-015 Live Source seam) is refused, naming both', () => {
    const { code, message } = codeOf(() =>
      validateFixedBank(bank(), { policy: POLICY, reservedLayers: [72, 73] }),
    );
    expect(code).toBe('overlaps-reserved');
    expect(message).toContain('70–79');
    expect(message).toContain('72, 73');
  });

  it('T10 — start+count-1 beyond 89 is refused, naming the ceiling', () => {
    const { code, message } = codeOf(() =>
      validateFixedBank(bank({ start: 75, count: 16 }), { policy: POLICY, reservedLayers: [] }),
    );
    expect(code).toBe('exceeds-ceiling');
    expect(message).toContain('89');
    expect(message).toContain('75–90');
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

describe('validateFixedBankChange', () => {
  const NEVER_BUSY = (): boolean => false;

  it('T12 — grow-at-end is accepted; shrink with all affected slots idle is accepted', () => {
    const grown = validateFixedBankChange(bank(), bank({ count: 12 }), {
      policy: POLICY,
      reservedLayers: [],
      isSlotBusy: NEVER_BUSY,
    });
    expect(grown).toHaveLength(12);

    const shrunk = validateFixedBankChange(bank(), bank({ count: 8 }), {
      policy: POLICY,
      reservedLayers: [],
      isSlotBusy: NEVER_BUSY,
    });
    expect(shrunk).toHaveLength(8);
  });

  it('T13 — a shrink over resident slots is refused, naming the occupied slot NUMBERS', () => {
    const busy = new Set([78, 79]);
    const { code, message } = codeOf(() =>
      validateFixedBankChange(bank(), bank({ count: 6 }), {
        policy: POLICY,
        reservedLayers: [],
        isSlotBusy: (slot: LayerSlot) => busy.has(slot.layer),
      }),
    );
    expect(code).toBe('shrink-occupied');
    expect(message).toContain('78, 79');
  });

  it('T14 — moving start or channel mid-session is refused with their codes', () => {
    expect(
      codeOf(() =>
        validateFixedBankChange(bank(), bank({ start: 71, count: 9 }), {
          policy: POLICY,
          reservedLayers: [],
          isSlotBusy: NEVER_BUSY,
        }),
      ).code,
    ).toBe('renumber-refused');
    expect(
      codeOf(() =>
        validateFixedBankChange(bank(), bank({ channel: 2 }), {
          policy: POLICY,
          reservedLayers: [],
          isSlotBusy: NEVER_BUSY,
        }),
      ).code,
    ).toBe('channel-change-refused');
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
