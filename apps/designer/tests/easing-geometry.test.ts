import { describe, expect, it } from 'vitest';
import type { BezierEasing } from '@cg/shared-schema';
import {
  bezierApproxEqual,
  bezierPathD,
  clamp01,
  curveToScreenX,
  curveToScreenY,
  effectiveBezier,
  presetKeyFor,
  screenToCurve,
} from '../src/renderer/features/inspector/easing-geometry.js';

/**
 * Pure easing-curve geometry extracted from EasingEditor's React closures. The
 * drag interaction is covered by the E2E suite; this guards the curve↔screen
 * mapping, preset matching, and the display-bézier fallback.
 */

// The editor's real plot box (SIZE 196, PAD 14 ⇒ PLOT 168), used for round-trips.
const PAD = 14;
const PLOT = 168;

describe('clamp01', () => {
  it('clamps to [0, 1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(5)).toBe(1);
  });
});

describe('curveToScreenX / curveToScreenY', () => {
  it('x maps left→pad, right→pad+plot', () => {
    expect(curveToScreenX(0, PAD, PLOT)).toBe(14);
    expect(curveToScreenX(1, PAD, PLOT)).toBe(182);
    expect(curveToScreenX(0.5, PAD, PLOT)).toBe(98);
  });
  it('y is flipped (progress points up): 0→bottom, 1→top', () => {
    expect(curveToScreenY(0, PAD, PLOT)).toBe(182);
    expect(curveToScreenY(1, PAD, PLOT)).toBe(14);
    expect(curveToScreenY(0.5, PAD, PLOT)).toBe(98);
  });
});

describe('screenToCurve', () => {
  it('inverts curveToScreen for a point inside the plot', () => {
    // Place the pointer at the screen position of curve (0.25, 0.75).
    const left = 1000;
    const top = 500;
    const clientX = left + curveToScreenX(0.25, PAD, PLOT);
    const clientY = top + curveToScreenY(0.75, PAD, PLOT);
    const p = screenToCurve(clientX, clientY, left, top, PAD, PLOT);
    expect(p.x).toBeCloseTo(0.25, 6);
    expect(p.y).toBeCloseTo(0.75, 6);
  });
  it('clamps a drag past any edge into [0, 1] on both axes', () => {
    const p = screenToCurve(-9999, -9999, 0, 0, PAD, PLOT);
    expect(p.x).toBe(0);
    expect(p.y).toBe(1); // top of the plot = progress 1
    const q = screenToCurve(9999, 9999, 0, 0, PAD, PLOT);
    expect(q.x).toBe(1);
    expect(q.y).toBe(0);
  });
});

describe('bezierPathD', () => {
  it('emits a cubic from (0,0) to (1,1) through the two control points', () => {
    // Simple box (pad 0, plot 100): y flips so (0,0)→100, (1,1)→0.
    expect(bezierPathD([0, 0, 1, 1], 0, 100)).toBe('M 0 100 C 0 100 100 0 100 0');
  });
  it('places the control points at their screen coords', () => {
    expect(bezierPathD([0.25, 0, 0.75, 1], 0, 100)).toBe('M 0 100 C 25 100 75 0 100 0');
  });
});

describe('bezierApproxEqual', () => {
  it('is true within the default tolerance', () => {
    expect(bezierApproxEqual([0.42, 0, 1, 1], [0.421, 0.001, 1, 1])).toBe(true);
  });
  it('is false past the tolerance on any component', () => {
    expect(bezierApproxEqual([0.42, 0, 1, 1], [0.5, 0, 1, 1])).toBe(false);
  });
});

describe('presetKeyFor', () => {
  it('matches the named presets', () => {
    expect(presetKeyFor([0, 0, 1, 1])).toBe('linear');
    expect(presetKeyFor([0.42, 0, 1, 1])).toBe('ease-in');
    expect(presetKeyFor([0, 0, 0.58, 1])).toBe('ease-out');
    expect(presetKeyFor([0.42, 0, 0.58, 1])).toBe('ease-in-out');
    expect(presetKeyFor([0.45, 0.05, 0.55, 0.95])).toBe('sine');
  });
  it('falls back to "custom" when nothing matches', () => {
    expect(presetKeyFor([0.1, 0.9, 0.2, 0.3])).toBe('custom');
  });
});

describe('effectiveBezier', () => {
  it('returns the keyframe custom curve when present', () => {
    const custom: BezierEasing = [0.1, 0.2, 0.3, 0.4];
    expect(effectiveBezier('linear', custom)).toBe(custom);
  });
  it('returns the preset for the named easing when there is no custom curve', () => {
    expect(effectiveBezier('ease-in', undefined)).toEqual([0.42, 0, 1, 1]);
    expect(effectiveBezier('ease-out', undefined)).toEqual([0, 0, 0.58, 1]);
  });
  it('falls back to linear for an easing with no smooth preset (step)', () => {
    expect(effectiveBezier('step', undefined)).toEqual([0, 0, 1, 1]);
  });
});
