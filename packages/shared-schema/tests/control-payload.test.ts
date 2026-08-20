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
  it('carries a look id through the payload the wire actually sends', () => {
    const payload = withCgControl({ headline: 'Tehran' } as FieldValues, { look: 'solo' });

    // Through the same JSON encode/decode the AMCP data argument goes through.
    const received: unknown = JSON.parse(JSON.stringify(payload));

    expect(readCgControl(received)?.look).toBe('solo');
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
});
