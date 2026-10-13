import { describe, expect, it } from 'vitest';
import { readCgControl, withCgControl, stripCgControl } from '@cg/shared-schema';
import type { FieldValues } from '@cg/shared-schema';

/**
 * 🔴 `SELF-STOP-24` §2.4 — **THE TAKE TOKEN CROSSES THE WIRE ON THE ROAD THAT ALREADY EXISTS.**
 *
 * A completion report must name the TAKE, not the template and not the layer. Otherwise a page
 * from an older take, a re-ADD, a re-take, or the BACKUP server's copy of the same page can each
 * stop a run that had only just started. The token is what makes the report specific, and it
 * rides `__cg` — the reserved key inside the field payload `CG ADD` and `CG UPDATE` already
 * carry — rather than minting a second transport whose delivery would have to be re-proven on
 * hardware.
 *
 * ⚠ Defensive for the same reason every other member here is: this arrives over AMCP from a
 * process that may be a different build, and a page that THROWS inside `update()` takes the
 * whole graphic off air. A malformed token is DROPPED, on its own, never with its siblings.
 */

const fields: FieldValues = { headline: 'Tehran' } as unknown as FieldValues;

/** What the page actually receives: JSON round-tripped, as AMCP delivers it. */
function overTheWire(payload: FieldValues): unknown {
  return JSON.parse(JSON.stringify(payload)) as unknown;
}

describe('SELF-STOP-24 — the take token crosses the wire intact', () => {
  it('survives the round trip', () => {
    const sent = withCgControl(fields, { take: 'a3f1c0de9b7248a1' });
    expect(readCgControl(overTheWire(sent))?.take).toBe('a3f1c0de9b7248a1');
  });

  it('rides alongside a look and a timing without any of the three displacing another', () => {
    // The namespace exists so a third member does not mint a top-level key every reader must
    // learn. All three arrive on the same ADD payload in production.
    const sent = withCgControl(fields, {
      look: 'solo',
      timing: { passes: 2 },
      take: 'a3f1c0de9b7248a1',
    });
    const read = readCgControl(overTheWire(sent));
    expect(read?.look).toBe('solo');
    expect(read?.timing).toEqual({ passes: 2 });
    expect(read?.take).toBe('a3f1c0de9b7248a1');
  });

  it('never reaches the field machinery — the strip still holds', () => {
    const sent = withCgControl(fields, { take: 'a3f1c0de9b7248a1' });
    const values = stripCgControl(overTheWire(sent) as Record<string, unknown>);
    expect(values).toEqual({ headline: 'Tehran' });
  });

  it('a malformed token is dropped ON ITS OWN, not with its siblings', () => {
    // The operator asked for two passes. Losing that because a token arrived as a number would
    // be a silent refusal of the half that mattered.
    const hostile = { __cg: { take: 42, timing: { passes: 2 } } };
    const read = readCgControl(hostile);
    expect(read?.take, 'a non-string token was carried through').toBeUndefined();
    expect(read?.timing, 'a good sibling was discarded with a bad member').toEqual({ passes: 2 });
  });

  it('an EMPTY token is not a token', () => {
    // An empty string would arm the page to report a take that names nothing, which the bridge
    // would answer 404 — a request sent for no reason on every run of every template.
    expect(readCgControl({ __cg: { take: '' } })?.take).toBeUndefined();
  });

  it('a payload that mentions no token says nothing about one', () => {
    // Absent means "this payload is silent on the subject", never "forget the one you have".
    expect(
      readCgControl(overTheWire(withCgControl(fields, { look: 'solo' })))?.take,
    ).toBeUndefined();
  });

  it('a page from an older build ignores it rather than breaking on it', () => {
    // The reverse-compat direction: unknown members are dropped, so a newer bridge talking to an
    // older page loses the token and nothing else.
    const read = readCgControl({ __cg: { take: 'a3f1c0de9b7248a1', somethingNewer: { x: 1 } } });
    expect(read?.take).toBe('a3f1c0de9b7248a1');
    expect(read).not.toHaveProperty('somethingNewer');
  });
});
