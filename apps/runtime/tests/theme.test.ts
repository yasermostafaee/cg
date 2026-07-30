import { describe, expect, it } from 'vitest';
import { airStateVisual, badgeTone, colors, readyDetail } from '../src/renderer/theme.js';

/**
 * B-044 — pin the badge mapping for the states the pending-intent contract
 * depends on. Without this, dropping the `unconfirmed` branch would silently
 * fall through to the IDLE default — hiding the operator-facing "command
 * result unknown" signal that is the whole point of the bounded expiry.
 */
describe('airStateVisual — B-044 badge states', () => {
  it("renders the explicit 'unconfirmed' bounded-timeout state (never the IDLE fallthrough)", () => {
    expect(airStateVisual('unconfirmed', false)).toEqual({
      color: colors.pending,
      icon: '?',
      label: 'UNCONFIRMED',
    });
  });

  it('keeps the transient and settled visuals distinct', () => {
    expect(airStateVisual('updating', false).label).toBe('UPDATING');
    expect(airStateVisual('playing', true).label).toBe('TAKING');
    expect(airStateVisual('playing', false).label).toBe('ON AIR');
  });
});

/**
 * `idle` and `loaded` are ONE presented state — READY — by owner decision: the
 * operator cannot perceive the difference, and showing two states for one
 * perception is false precision.
 *
 * These pin BOTH halves of that decision, because the second half is what keeps it
 * honest. The difference is real — a `loaded` row plays immediately, an `idle` row
 * has to build its producer on CasparCG first, which takes time and can fail — so
 * if the presentation collapses without the explanation surviving somewhere, a slow
 * take starts reading as a bug.
 */
describe('airStateVisual / readyDetail — the READY merge', () => {
  it('presents `idle` and `loaded` identically: same word, same icon, same colour', () => {
    expect(airStateVisual('idle', false)).toEqual(airStateVisual('loaded', false));
    expect(airStateVisual('idle', false).label).toBe('READY');
    expect(badgeTone('idle', false)).toBe(badgeTone('loaded', false));
  });

  it('keeps the difference reachable, and distinguishable, in the detail text', () => {
    const idle = readyDetail('idle');
    const loaded = readyDetail('loaded');
    expect(idle).toBeDefined();
    expect(loaded).toBeDefined();
    expect(idle).not.toBe(loaded);
    // The one fact an operator needs when a take is slow or fails: this row had to
    // load first. Asserted on the substance, not the phrasing.
    expect(idle).toMatch(/nothing is on the layer yet/i);
    expect(loaded).toMatch(/immediately/i);
  });

  it('offers no detail for states that are not READY — it would be noise', () => {
    expect(readyDetail('on-air')).toBeUndefined();
    expect(readyDetail('error')).toBeUndefined();
  });
});

/**
 * B-086 — the link-down "unverifiable" badge is muted "WAS ON AIR": NEVER the broadcast AIR
 * COLOUR of an ON AIR claim (the wire no longer backs it), NEVER the amber of B-044's
 * `unconfirmed` (a different, item-scoped condition).
 *
 * Says "air colour", not "red": on-air is GREEN now (owner decision, see `theme.ts`). The
 * assertions below are role-based and so were unaffected by that move — which is exactly why
 * the PROSE has to be corrected by hand, and why re-wording R-006/B-087 in the PRD is recorded
 * in DEBT.md as owed. A rule written about a colour the product no longer uses protects nothing.
 */
describe('airStateVisual / badgeTone — B-086 unverified', () => {
  it("renders 'unverified' as muted 'WAS ON AIR'", () => {
    expect(airStateVisual('unverified', false)).toEqual({
      color: colors.textMuted,
      icon: '◌',
      label: 'WAS ON AIR',
    });
  });

  it('tones it muted grey — not the on-air role, not the unconfirmed amber', () => {
    expect(badgeTone('unverified', false)).toBe('idle'); // the --r-text-muted grey role
    expect(badgeTone('unverified', false)).not.toBe('onair');
    expect(badgeTone('unverified', false)).not.toBe(badgeTone('unconfirmed', false)); // 'attention'
    // pending never turns it into a spinner/red — it is a resting state.
    expect(badgeTone('unverified', true)).toBe('idle');
  });
});
