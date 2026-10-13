import { describe, expect, it } from 'vitest';
import { readCgControl, withCgControl, stripCgControl, CG_CONTROL_KEY } from '@cg/shared-schema';
import type { FieldValues } from '@cg/shared-schema';

/**
 * 🔴 `TIMING-WIRE-22` (a) + (b) — THE ROAD FROM THE CONSOLE TO A RUNNING LOOP.
 *
 * The pass loop runs in the template's own JS inside CasparCG's CEF. No AMCP verb carries
 * timing — the surface is ADD / PLAY / UPDATE / STOP / NEXT / CLEAR / MIXER — so the ONLY way a
 * console can change a count on a graphic that is already on air is a `CG UPDATE` carrying the
 * reserved `__cg` control object. These cases pin that road end to end at the payload layer:
 * what the bridge writes, what survives a hostile wire, and what the page is allowed to see.
 *
 * ⚠ Everything here is DEFENSIVE BY DESIGN, and the reason is worth restating: this payload
 * crosses AMCP from a process that may be a different build, and a page that THROWS inside
 * `update()` takes the whole graphic off air. So every malformed member is DROPPED, never
 * thrown on — a wrong count is bad, a black channel is worse.
 */

const fields: FieldValues = { headline: 'Tehran' } as unknown as FieldValues;

/** What the page actually receives: JSON round-tripped, as AMCP delivers it. */
function overTheWire(payload: FieldValues): unknown {
  return JSON.parse(JSON.stringify(payload)) as unknown;
}

describe('TIMING-WIRE-22 (a) — the timing member crosses the wire intact', () => {
  it('a count and a gap survive the round trip', () => {
    const sent = withCgControl(fields, { timing: { passes: 2, delayMs: 1500 } });
    expect(readCgControl(overTheWire(sent))?.timing).toEqual({ passes: 2, delayMs: 1500 });
  });

  it('rides alongside a look without either displacing the other', () => {
    // One payload, two pieces of control data. The namespace exists so a second member does not
    // mint a top-level key every reader has to learn.
    const sent = withCgControl(fields, { look: 'solo', timing: { passes: 'infinite' } });
    const read = readCgControl(overTheWire(sent));
    expect(read?.look).toBe('solo');
    expect(read?.timing).toEqual({ passes: 'infinite' });
  });

  it('never reaches the field machinery — the strip still holds', () => {
    // Half the reserved key's collision proof: control data cannot be written into a field.
    const sent = withCgControl(fields, { timing: { passes: 2 } });
    const values = stripCgControl(overTheWire(sent) as Record<string, unknown>);
    expect(CG_CONTROL_KEY in values).toBe(false);
    expect(values).toEqual({ headline: 'Tehran' });
  });

  it('ZERO passes survives — it is an instruction, not an empty value', () => {
    // `0` means "after this pass, go out". A truthiness check anywhere on this road would eat
    // it and turn the instruction into silence.
    const sent = withCgControl(fields, { timing: { passes: 0 } });
    expect(readCgControl(overTheWire(sent))?.timing).toEqual({ passes: 0 });
  });

  it('a ZERO gap survives too, and means no gap', () => {
    const sent = withCgControl(fields, { timing: { delayMs: 0 } });
    expect(readCgControl(overTheWire(sent))?.timing).toEqual({ delayMs: 0 });
  });
});

describe('TIMING-WIRE-22 (a) — a malformed member is dropped, never thrown on', () => {
  const read = (timing: unknown): unknown =>
    readCgControl({ [CG_CONTROL_KEY]: { timing } })?.timing;

  it('drops a non-object timing', () => {
    for (const bad of ['2', 2, null, [], true]) expect(read(bad)).toBeUndefined();
  });

  it('drops a negative or fractional count, and a negative gap', () => {
    // REFUSED by omission at this layer rather than clamped: a clamp here would silently turn a
    // nonsense value into a plausible one, and the console would then display a number nothing
    // had agreed to.
    expect(read({ passes: -1 })).toBeUndefined();
    expect(read({ passes: 1.5 })).toBeUndefined();
    expect(read({ delayMs: -1 })).toBeUndefined();
  });

  it('drops a bad member WITHOUT taking its good sibling with it', () => {
    // The operator asked for two more passes. Losing that because the gap arrived as a string
    // would be a silent refusal of the half that mattered.
    expect(read({ passes: 2, delayMs: 'soon' })).toEqual({ passes: 2 });
    expect(read({ passes: 'lots', delayMs: 500 })).toEqual({ delayMs: 500 });
  });

  it('an all-bad timing object reads as NO timing, not as empty timing', () => {
    // A reader cannot tell "no opinion" from "an opinion saying nothing", and the second would
    // be applied as a change when it is not one.
    expect(read({ passes: 'lots', delayMs: 'soon' })).toBeUndefined();
    expect(read({})).toBeUndefined();
  });

  it('an unknown member is ignored — a newer bridge may talk to an older page', () => {
    expect(read({ passes: 2, somethingNew: 9 })).toEqual({ passes: 2 });
  });
});

describe('TIMING-WIRE-22 (b) — absent timing means UNCHANGED', () => {
  it('an ordinary field update carries no timing at all', () => {
    // The page calls `setPassTiming` only when the member is present. An update that carried a
    // defaulted timing object would reset a running count on every text change.
    const sent = withCgControl(fields, { look: 'solo' });
    expect(readCgControl(overTheWire(sent))?.timing).toBeUndefined();
  });

  it('a payload with no control object at all reads as no control', () => {
    expect(readCgControl(overTheWire(fields))).toBeUndefined();
  });
});
