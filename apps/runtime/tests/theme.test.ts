import { describe, expect, it } from 'vitest';
import { airStateVisual, badgeTone, colors } from '../src/renderer/theme.js';

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
    expect(airStateVisual('idle', false).label).toBe('IDLE');
  });
});

/**
 * B-086 — the link-down "unverifiable" badge is muted "WAS ON AIR": NEVER the broadcast red of
 * an ON AIR claim (the wire no longer backs it), NEVER the amber of B-044's `unconfirmed` (a
 * different, item-scoped condition).
 */
describe('airStateVisual / badgeTone — B-086 unverified', () => {
  it("renders 'unverified' as muted 'WAS ON AIR'", () => {
    expect(airStateVisual('unverified', false)).toEqual({
      color: colors.textMuted,
      icon: '◌',
      label: 'WAS ON AIR',
    });
  });

  it('tones it muted grey — not the on-air red, not the unconfirmed amber', () => {
    expect(badgeTone('unverified', false)).toBe('idle'); // the --r-text-muted grey role
    expect(badgeTone('unverified', false)).not.toBe('onair');
    expect(badgeTone('unverified', false)).not.toBe(badgeTone('unconfirmed', false)); // 'attention'
    // pending never turns it into a spinner/red — it is a resting state.
    expect(badgeTone('unverified', true)).toBe('idle');
  });
});
