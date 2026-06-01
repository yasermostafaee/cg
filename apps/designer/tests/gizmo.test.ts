import { describe, expect, it } from 'vitest';
import { rotateHandleCentre } from '../src/renderer/features/canvas/Gizmo.js';

/**
 * B-004 regression — when the element is rotated, the gizmo handles are
 * rendered inside a same-rotated wrapper, so the rotate-drag handler has
 * to recover the element centre from the handle position + current angle
 * (R(θ)·(0, h/2 + 22)). Before the fix, beginRotate assumed unrotated
 * geometry (`cy = handleY + 22`) and the centre drifted as soon as the
 * element was rotated.
 */
describe('rotateHandleCentre', () => {
  it('places the centre directly below the handle at rotation 0', () => {
    const { cx, cy } = rotateHandleCentre(100, 0, 80, 0);
    expect(cx).toBeCloseTo(100);
    expect(cy).toBeCloseTo(0 + 80 / 2 + 22);
  });

  it('places the centre to the left of the handle at rotation 90', () => {
    // At 90° the local +y axis (handle → centre) points to viewport −x.
    const { cx, cy } = rotateHandleCentre(100, 0, 80, 90);
    expect(cx).toBeCloseTo(100 - (80 / 2 + 22));
    expect(cy).toBeCloseTo(0);
  });

  it('places the centre above the handle at rotation 180', () => {
    const { cx, cy } = rotateHandleCentre(100, 0, 80, 180);
    expect(cx).toBeCloseTo(100);
    expect(cy).toBeCloseTo(0 - (80 / 2 + 22));
  });

  it('places the centre to the right of the handle at rotation 270', () => {
    const { cx, cy } = rotateHandleCentre(100, 0, 80, 270);
    expect(cx).toBeCloseTo(100 + (80 / 2 + 22));
    expect(cy).toBeCloseTo(0);
  });
});
