import { describe, expect, it } from 'vitest';
import {
  CG_CONTROL_KEY,
  readCgControl,
  stripCgControl,
  withCgControl,
  type FieldValues,
} from '../src/index.js';

/**
 * `multibox-layout-switch` `tasks.md` 6.7 — **the bridge→page control payload, as a codec.**
 *
 * 🔴 These tests exist because this module is the ONLY thing standing between the two halves
 * of a look switch. The bridge writes with `withCgControl`, the page reads with
 * `readCgControl`, and if those two ever disagreed the fills would move to one look while the
 * holes moved to another — which is precisely the on-air defect 6.7 closes. A round-trip test
 * is the cheapest possible proof that they cannot.
 */

describe('the round trip — the bridge writes, the page reads', () => {
  it('round-trips a live position alongside ordinary fields', () => {
    const fields: FieldValues = { headline: 'Tehran' };
    const position = { anchor: 'mid-left', offset: { x: -25.5, y: 60 } } as const;
    const received: unknown = JSON.parse(JSON.stringify(withCgControl(fields, { position })));
    expect(readCgControl(received)).toEqual({ position });
    expect(stripCgControl(received as FieldValues)).toEqual(fields);
  });

  it('carries a look id through the payload the wire actually sends', () => {
    const payload = withCgControl({ headline: 'Tehran' } as FieldValues, { look: 'solo' });

    // Through the same JSON encode/decode the AMCP data argument goes through.
    const received: unknown = JSON.parse(JSON.stringify(payload));

    expect(readCgControl(received)?.look).toBe('solo');
  });

  it('round-trips the named hold and release without exposing them to authored fields', () => {
    const phases = [
      { phase: 'hold', id: 'preset-cut-1', plateIds: ['guest-1', 'guest-2'] },
      { phase: 'release', id: 'preset-cut-1' },
    ] as const;
    for (const phase of phases) {
      const liveFallback =
        phase.phase === 'hold' ? { ...phase, plateIds: [...phase.plateIds] } : phase;
      const payload = JSON.parse(
        JSON.stringify(withCgControl({ headline: 'Tehran' }, { look: 'solo', liveFallback })),
      ) as Record<string, unknown>;
      expect(readCgControl(payload)).toEqual({ look: 'solo', liveFallback });
      expect(stripCgControl(payload)).toEqual({ headline: 'Tehran' });
    }
  });

  it('carries only valid live-plate fit facts through the wire payload', () => {
    const payload = withCgControl({} as FieldValues, {
      plates: {
        left: { aspect: 16 / 9, mode: 'cover' },
        right: { aspect: null, mode: 'contain' },
      },
    });

    expect(readCgControl(JSON.parse(JSON.stringify(payload)))?.plates).toEqual({
      left: { aspect: 16 / 9, mode: 'cover' },
      right: { aspect: null, mode: 'contain' },
    });
  });

  it('leaves the author fields untouched, and keeps them out of the control object', () => {
    const payload = withCgControl({ headline: 'Tehran', sub: 'Live' } as FieldValues, {
      look: 'six',
    });
    expect(stripCgControl(payload as Record<string, unknown>)).toEqual({
      headline: 'Tehran',
      sub: 'Live',
    });
  });

  it('attaches NOTHING for an empty control object', () => {
    // A reserved key on every update for no content is noise a reader cannot distinguish
    // from "control data that says nothing".
    const fields = { headline: 'Tehran' } as FieldValues;
    expect(withCgControl(fields, {})).toEqual(fields);
    expect(CG_CONTROL_KEY in withCgControl(fields, {})).toBe(false);
  });
});

describe('stripCgControl — half of the collision proof', () => {
  it('🔴 removes the reserved key, so control data can NEVER become a field value', () => {
    const payload = { headline: 'Tehran', [CG_CONTROL_KEY]: { look: 'solo' } };
    const values = stripCgControl(payload);
    expect(CG_CONTROL_KEY in values).toBe(false);
    expect(values).toEqual({ headline: 'Tehran' });
  });

  it('returns a payload with no reserved key unchanged, by identity', () => {
    // The common case is every ordinary update: it must not allocate a copy per call.
    const payload = { headline: 'Tehran' };
    expect(stripCgControl(payload)).toBe(payload);
  });
});

describe('readCgControl — defensive, because this arrives over AMCP', () => {
  it('carries mask edits, preserves an explicit reset and drops invalid windows', () => {
    const authored = { x: 0.125, y: 0.25, width: 0.25, height: 0.25 };
    const edit = {
      lookId: 'solo',
      plateId: 'guest-1',
      kind: 'mask',
      index: 0,
      authored,
      rect: { ...authored, x: 0.5 },
    } as const;
    expect(readCgControl(withCgControl({}, { maskPlacements: [edit] }))).toEqual({
      maskPlacements: [edit],
    });
    expect(readCgControl(withCgControl({}, { maskPlacements: [] }))).toEqual({
      maskPlacements: [],
    });
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: { maskPlacements: [{ ...edit, rect: { ...authored, x: 0.875 } }] },
      }),
    ).toEqual({});
  });

  it.each([
    null,
    { anchor: 'top-middle', offset: { x: 0, y: 0 } },
    { anchor: 'center', offset: { x: 0 } },
    { anchor: 'center', offset: { x: 0, y: Infinity } },
  ])('drops invalid position %o without discarding sibling controls', (position) => {
    expect(readCgControl({ [CG_CONTROL_KEY]: { look: 'solo', position } })).toEqual({
      look: 'solo',
    });
  });

  it('answers undefined for a payload carrying no control data', () => {
    expect(readCgControl({ headline: 'Tehran' })).toBeUndefined();
    expect(readCgControl(undefined)).toBeUndefined();
    expect(readCgControl(null)).toBeUndefined();
    expect(readCgControl('a string')).toBeUndefined();
  });

  it('🔴 tolerates a MALFORMED control object instead of throwing', () => {
    /*
      This payload crosses a process boundary from a bridge that may be a different version.
      A throw inside the page's `update()` takes the whole graphic off air, so a shape it
      does not recognise must read as "says nothing about looks", never as an exception.
    */
    expect(readCgControl({ [CG_CONTROL_KEY]: 'not an object' })).toBeUndefined();
    expect(readCgControl({ [CG_CONTROL_KEY]: ['an', 'array'] })).toBeUndefined();
    expect(readCgControl({ [CG_CONTROL_KEY]: { look: 42 } })).toEqual({});
    expect(readCgControl({ [CG_CONTROL_KEY]: { look: '' } })).toEqual({});
    expect(readCgControl({ [CG_CONTROL_KEY]: { other: 'x' } })).toEqual({});
  });

  it.each([
    { phase: 'hold', id: '', plateIds: ['guest-1'] },
    { phase: 'hold', id: 'cut', plateIds: [] },
    { phase: 'hold', id: 'cut', plateIds: Array.from({ length: 65 }, () => 'plate') },
    { phase: 'hold', id: 'cut', plateIds: ['guest-1', 42] },
    { phase: 'release', id: 42 },
    { phase: 'replace', id: 'cut', plateIds: ['guest-1'] },
  ])('drops malformed fallback phase %o without losing the look', (liveFallback) => {
    expect(readCgControl({ [CG_CONTROL_KEY]: { look: 'solo', liveFallback } })).toEqual({
      look: 'solo',
    });
  });

  it('drops malformed plate fits one entry at a time', () => {
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: {
          plates: {
            good: { aspect: 4 / 3, mode: 'contain' },
            zero: { aspect: 0, mode: 'contain' },
            infinite: { aspect: Number.POSITIVE_INFINITY, mode: 'cover' },
            mode: { aspect: 1, mode: 'stretch' },
            scalar: 'bad',
          },
        },
      }),
    ).toEqual({ plates: { good: { aspect: 4 / 3, mode: 'contain' } } });
    expect(readCgControl({ [CG_CONTROL_KEY]: { plates: [] } })).toEqual({});
  });
});

/*
 * 🔴 **`single-clock-look-switch` — the `from` block is GONE, with the member it tested.**
 *
 * `from` named the look a switch was LEAVING so the page could punch `outgoing ∩ entering`
 * while the two clocks disagreed. There are no holes now — the page sits BELOW its plates —
 * so there is nothing to narrow. R-105 later restored `plates` for a different consumer: the
 * authored fallback below the external producer follows the same visible fitted area.
 *
 * ⚠ What SURVIVES, and is still covered above, is the look id itself and the codec's
 * defensiveness: an unknown member is DROPPED rather than carried, which is what lets a page
 * from an older build read a payload from a newer bridge (and the reverse) without throwing.
 */
