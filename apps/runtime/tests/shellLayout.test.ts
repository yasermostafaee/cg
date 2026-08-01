import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSPECTOR_PX,
  NARROW_BREAKPOINT_PX,
  clampInspector,
} from '../src/renderer/hooks/useShellLayout.js';

/**
 * R-028 part B — the workspace geometry's ONE non-negotiable property: the
 * operator can never strand themselves.
 *
 * The owner's words: "an operator who drags a panel to zero at 2 a.m. must not
 * be stuck". Two mechanisms carry that, and both are pinned here — the clamp
 * (a drag physically cannot reach zero) and the default (the reset target).
 * The clamp is the important one: `reset()` only helps if the operator can
 * still find the button, and a panel dragged to 0px might be hiding it.
 */

describe('clampInspector — neither panel can be dragged away', () => {
  it('refuses to make the Inspector vanish, however far the drag goes', () => {
    for (const requested of [0, -500, 1, 12]) {
      expect(clampInspector(requested, 1600)).toBeGreaterThanOrEqual(240);
    }
  });

  it('refuses to squeeze the WORKSPACE away either — a drag the other way', () => {
    // A 1600px viewport must keep at least a usable layer row beside it, so the
    // Inspector cannot take (nearly) everything.
    const clamped = clampInspector(5000, 1600);
    expect(1600 - clamped).toBeGreaterThanOrEqual(420);
  });

  it('leaves a reasonable width untouched', () => {
    expect(clampInspector(400, 1600)).toBe(400);
    expect(clampInspector(DEFAULT_INSPECTOR_PX, 1600)).toBe(DEFAULT_INSPECTOR_PX);
  });

  it('on a cramped viewport the floors still resolve to something usable', () => {
    // Both floors cannot be honoured at 500px; the Inspector floor wins so the
    // result is never zero or negative — the layout degrades, never breaks.
    const clamped = clampInspector(DEFAULT_INSPECTOR_PX, 500);
    expect(clamped).toBeGreaterThan(0);
    expect(Number.isFinite(clamped)).toBe(true);
  });
});

describe('the narrow breakpoint', () => {
  it('is 900px — recorded so a later change is a deliberate one', () => {
    // Below this the Inspector stops being a column and becomes an overlay:
    // a squeezed Inspector beside a squeezed layer row makes both useless.
    expect(NARROW_BREAKPOINT_PX).toBe(900);
  });
});
