import { describe, it, expect } from 'vitest';
import {
  RetainedStackItemSchema,
  StackItemStateSchema,
  StackItemTimingOverrideSchema,
} from '../src/runtime/item-state.js';

/**
 * 🔴 `TIMING-BUILD-21` §2(a) — THE STRIP GUARD.
 *
 * `RetainedStackItemSchema` is a strict `z.object` AND it is the `stack.restore` wire payload.
 * A key it does not declare is removed by `parse` **silently**: no error, no warning, nothing in
 * a log. So a per-row override that is plumbed everywhere EXCEPT here works perfectly until the
 * first bridge blip and then vanishes — the operator sets two more passes, watches it take, and
 * after a reconnect the row is looping forever with the console showing it as normal.
 *
 * That is the worst failure shape available: correct behaviour, then silent reversion, with no
 * moment anyone can point at. `B-107` / `B-109` are the two incidents that made retention's open
 * axis a written doctrine, and this guard is what keeps a new field from repeating them.
 *
 * ⚠ **PLANTED-RED PROVENANCE.** Verified to BITE by commenting `timingOverride` out of
 * `RetainedStackItemSchema` and re-running: `survives a retention round-trip` failed with
 * `timingOverride` undefined on the far side. Restored, it passes.
 */

const BASE = {
  itemId: 'item-1',
  templateId: 'tpl-1',
  fields: {},
  // `RetainedAirStateSchema` — the CLOSED axis. `on-air` is the state that matters here: a row
  // that was live is the one whose override going missing after a blip is an on-air incident.
  state: 'on-air',
} as const;

describe('TIMING-BUILD-21 §2(a) — the row timing override survives retention', () => {
  it('survives a retention round-trip', () => {
    const withOverride = { ...BASE, timingOverride: { repeat: 2, delayMs: 1500 } };
    const parsed = RetainedStackItemSchema.parse(withOverride);
    expect(
      parsed.timingOverride,
      'the strict schema stripped it — it would work until the first restart',
    ).toEqual({ repeat: 2, delayMs: 1500 });
  });

  it('survives on the LIVE state too, not only the retained copy', () => {
    // Both halves or neither: on the wire and gone after a blip is the same bug as retained
    // and invisible.
    const parsed = StackItemStateSchema.parse({
      itemId: 'item-1',
      templateId: 'tpl-1',
      fields: {},
      status: 'on-air',
      pending: false,
      timingOverride: { repeat: 'infinite', delayMs: 0 },
    });
    expect(parsed.timingOverride).toEqual({ repeat: 'infinite', delayMs: 0 });
  });

  it('a ZERO survives as a value, never collapsing to absent', () => {
    // A zero-value override is a real instruction — "no gap", and "out after this pass" — and
    // this tree has paid for truthiness checks on exactly this shape more than once.
    const parsed = RetainedStackItemSchema.parse({
      ...BASE,
      timingOverride: { repeat: 0, delayMs: 0 },
    });
    expect(parsed.timingOverride?.repeat).toBe(0);
    expect(parsed.timingOverride?.delayMs).toBe(0);
  });

  it('ABSENT means inheriting — it is a third state, not a zero', () => {
    const parsed = RetainedStackItemSchema.parse(BASE);
    expect(parsed.timingOverride).toBeUndefined();
  });
});

describe('TIMING-BUILD-21 §6 — the override floor differs from the authored floor', () => {
  it('accepts 0 passes, because on air that means "out after this one"', () => {
    expect(StackItemTimingOverrideSchema.parse({ repeat: 0 }).repeat).toBe(0);
  });

  it('refuses a negative count and a negative delay rather than clamping them', () => {
    // REFUSED, not rewritten: a silent clamp is a lie the operator cannot see.
    expect(StackItemTimingOverrideSchema.safeParse({ repeat: -1 }).success).toBe(false);
    expect(StackItemTimingOverrideSchema.safeParse({ delayMs: -1 }).success).toBe(false);
  });

  it('refuses a fractional pass count', () => {
    expect(StackItemTimingOverrideSchema.safeParse({ repeat: 1.5 }).success).toBe(false);
  });
});
