import { describe, expect, it } from 'vitest';
import { airStateVisual, colors } from '../src/renderer/theme.js';

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
