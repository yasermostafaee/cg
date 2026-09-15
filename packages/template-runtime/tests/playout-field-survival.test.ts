import { describe, it, expect } from 'vitest';
import { PlayoutSchema, playoutOf, repeatOf, delayMsOf, type Playout } from '@cg/shared-schema';
import { mergePlayoutOverride } from '../src/playout-merge.js';

/**
 * 🔴 `TIMING-BUILD-21` §2 — THE SILENT-DROP GUARD.
 *
 * Two sites in this tree rebuilt a typed object as an EXHAUSTIVE OBJECT LITERAL, and an
 * exhaustive literal silently drops any field it does not name. There is no compiler error: the
 * literal still satisfies the type, because every droppable field is optional. The symptom shows
 * up only on air, or only after a restart.
 *
 * The pattern has now eaten a field TWICE — `fit` in the console's plate writer, and `delayMs`
 * would have been the second, in `effectivePlayoutFor`. That is why this is a test and not a
 * comment: a written note did not stop the second one.
 *
 * ⚠ **WHAT THIS GUARDS IS A PROPERTY, NOT A FIELD LIST.** A test naming today's fields would go
 * on passing forever while tomorrow's field is dropped. These cases enumerate the keys the
 * SCHEMA produces and assert that every one survives the merge — so a field added to
 * `PlayoutSchema` is covered here the day it is added, with no edit to this file.
 *
 * ⚠ **PLANTED-RED PROVENANCE — this guard has been watched to fail.** With the spread in
 * `mergePlayoutOverride` replaced by the old exhaustive literal
 * (`{ mode, holdSource, holdMs, repeat }`), the first case failed with
 * `fields lost in the merge: delayMs`. Restored, it passes. A guard nobody has seen fail is a
 * guard nobody knows the shape of.
 */

/** Every timing key the schema can produce, with a distinguishable value in each. */
const FULLY_POPULATED = {
  mode: 'loop-cycle',
  holdSource: 'timed',
  holdMs: 1234,
  repeat: 3,
  delayMs: 567,
} as const;

describe('TIMING-BUILD-21 §2(b) — the playout merge must not drop a field', () => {
  it('every key the schema resolves survives the merge, with its value intact', () => {
    // Parse through the SCHEMA so this case learns new fields automatically: whatever
    // `PlayoutSchema` accepts is what must arrive on the other side.
    const stored = PlayoutSchema.parse(FULLY_POPULATED) as Playout;
    const merged = mergePlayoutOverride(stored, undefined);

    const keys = Object.keys(stored) as (keyof Playout)[];
    expect(
      keys.length,
      'the schema produced no keys — this case would pass vacuously',
    ).toBeGreaterThan(3);

    const lost = keys.filter((k) => stored[k] !== undefined && merged[k] === undefined);
    expect(lost, `fields lost in the merge: ${lost.join(', ')}`).toEqual([]);
    for (const k of keys) {
      expect(merged[k], `field ${String(k)} changed in transit`).toEqual(stored[k]);
    }
  });

  it('a key the override never mentions is taken from the base, not erased', () => {
    const stored = PlayoutSchema.parse(FULLY_POPULATED) as Playout;
    const merged = mergePlayoutOverride(stored, { holdMs: 10 });

    expect(merged.holdMs, 'the override applies').toBe(10);
    const untouched = (Object.keys(stored) as (keyof Playout)[]).filter((k) => k !== 'holdMs');
    for (const k of untouched) {
      expect(merged[k], `field ${String(k)} was erased by an override that never named it`).toEqual(
        stored[k],
      );
    }
  });

  it('an explicit undefined in the override does not punch a hole in the base', () => {
    const stored = PlayoutSchema.parse(FULLY_POPULATED) as Playout;
    // `exactOptionalPropertyTypes` distinguishes absent from present-and-undefined; a naive
    // spread would let the second overwrite a resolved value with nothing.
    const merged = mergePlayoutOverride(stored, { delayMs: undefined, repeat: undefined });
    expect(merged.delayMs).toBe(FULLY_POPULATED.delayMs);
    expect(merged.repeat).toBe(FULLY_POPULATED.repeat);
  });

  it('per-element timing maps are never smuggled into the playout', () => {
    const stored = PlayoutSchema.parse(FULLY_POPULATED) as Playout;
    const merged = mergePlayoutOverride(stored, {
      tickers: { t1: { repeat: 9 } },
      sequences: { s1: { dwellMs: 1 } },
      countdowns: { c1: { durationMs: 2 } },
    });
    for (const foreign of ['tickers', 'sequences', 'countdowns']) {
      expect(
        Object.hasOwn(merged, foreign),
        `${foreign} is per-ELEMENT timing and does not belong on a Playout`,
      ).toBe(false);
    }
  });
});

describe('TIMING-BUILD-21 §3 — the timing defaults are stated once, in the schema', () => {
  const bare = { schemaVersion: 1, playout: PlayoutSchema.parse({ mode: 'loop-cycle' }) };

  it('an absent repeat reads as infinite through the one resolver', () => {
    const resolved = playoutOf({ playout: bare.playout, lifecycle: { outPoint: 25 } } as never);
    // Resolve-on-read: the field stays ABSENT on the stored object (no migration), so the
    // guarantee is what the resolver answers, and there is exactly one resolver.
    expect(resolved.repeat).toBeUndefined();
    expect(repeatOf(resolved)).toBe('infinite');
  });

  it('an absent delay reads as zero — no gap unless one was asked for', () => {
    const resolved = playoutOf({ playout: bare.playout, lifecycle: { outPoint: 25 } } as never);
    expect(resolved.delayMs).toBeUndefined();
    expect(delayMsOf(resolved)).toBe(0);
  });

  it('an explicit value always outranks the default', () => {
    expect(repeatOf({ repeat: 4 })).toBe(4);
    expect(delayMsOf({ delayMs: 0 })).toBe(0);
    expect(delayMsOf({ delayMs: 2000 })).toBe(2000);
  });
});
