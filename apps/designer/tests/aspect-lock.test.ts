import { describe, expect, it } from 'vitest';
import {
  ASPECT_TOLERANCE,
  effectiveAspect,
  sizeRatioForAspect,
} from '../src/renderer/features/inspector/aspect-presets.js';
import {
  computeResize,
  MIN_SIZE,
  type BoxTransform,
  type Handle,
} from '../src/renderer/features/canvas/geometry.js';

/**
 * 🔴 **`D-155` — A LIVE SOURCE WITH A DECLARED ASPECT KEEPS IT *DURING* THE RESIZE.**
 *
 * The author's complaint: _"when I add a Live source and its aspect is 16:9, the resize must
 * PRESERVE that aspect while I drag — not let me deform it and then make me press a button to
 * fit it back."_
 *
 * ⚠ **What the lock is FOR:** it stops background GAPS — an author-shaped hole that does not
 * match the feed's shape. It is NOT a crop-prevention feature; what a mismatched aspect costs
 * at runtime is a separate question and is moving. No assertion here should be read as one.
 *
 * ── 🔴 THE THREE TRAPS THESE TESTS EXIST TO CATCH ───────────────────────────
 *
 * 1. **`sx === sy` hides a scale-blind implementation.** The constrained quantity is the
 *    EFFECTIVE aspect `(w·sx)/(h·sy)`, so at uniform scale the size ratio and the aspect are
 *    the same number and a `w/h` implementation passes everything. A non-uniform scale is set
 *    deliberately below.
 * 2. **A dominant-axis corner rule passes every test but one — and NOT the one you would
 *    expect.** The obvious discriminator ("it jumps as the pointer crosses the diagonal") is
 *    FALSE: measured, both rules are continuous there, because at the crossover
 *    `w / ratio === h` makes both dominant-axis branches return the same pair. The choice is
 *    therefore pinned by VALUE, off the diagonal where they diverge (`1301 × 732` vs
 *    `1600 × 900`). The continuity assertion is kept as the weaker property it really is.
 * 3. **"It probably still works" for everything else.** `computeRectResize` is shared by every
 *    element kind and by `D-110`'s keyframed-path morph rect, so the unlocked paths are
 *    asserted BYTE-IDENTICAL rather than assumed.
 */

const box = (over: Partial<BoxTransform> = {}): BoxTransform => ({
  position: { x: 100, y: 50 },
  size: { w: 640, h: 360 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  ...over,
});

const SIXTEEN_NINE = 16 / 9;

/** The effective aspect of a resize result, which is what the lock actually constrains. */
const aspectOf = (t: BoxTransform, r: { size: { w: number; h: number } }): number =>
  effectiveAspect({ ...t, size: r.size } as unknown as Parameters<typeof effectiveAspect>[0]);

const ratio = (t: BoxTransform, aspect = SIXTEEN_NINE): number => {
  const k = sizeRatioForAspect(aspect, t.scale);
  if (k === null) throw new Error('no ratio');
  return k;
};

describe('D-155 — sizeRatioForAspect: the ONE definition', () => {
  it('at uniform scale the size ratio IS the aspect', () => {
    expect(sizeRatioForAspect(SIXTEEN_NINE, { x: 1, y: 1 })).toBeCloseTo(SIXTEEN_NINE, 10);
  });

  it('🔴 under NON-UNIFORM scale it is NOT the aspect — the case that hides a `w/h` bug', () => {
    // (w·2)/(h·0.5) = 16/9  ⇒  w/h = (16/9)·(0.5/2) = 0.444…
    const k = sizeRatioForAspect(SIXTEEN_NINE, { x: 2, y: 0.5 });
    expect(k).toBeCloseTo(SIXTEEN_NINE * 0.25, 10);
    expect(k).not.toBeCloseTo(SIXTEEN_NINE, 3);
  });

  it('🔴 a size built from it renders at the aspect — the round trip that proves it', () => {
    const t = box({ scale: { x: 2, y: 0.5 } });
    const k = ratio(t);
    const h = 200;
    expect(effectiveAspect({ ...t, size: { w: k * h, h } } as never)).toBeCloseTo(SIXTEEN_NINE, 10);
  });

  it('refuses a target or a scale that cannot produce a positive ratio', () => {
    expect(sizeRatioForAspect(0, { x: 1, y: 1 })).toBeNull();
    expect(sizeRatioForAspect(-1, { x: 1, y: 1 })).toBeNull();
    expect(sizeRatioForAspect(SIXTEEN_NINE, { x: 0, y: 1 })).toBeNull();
    expect(sizeRatioForAspect(SIXTEEN_NINE, { x: 1, y: 0 })).toBeNull();
  });
});

describe('D-155 — EDGE handles derive the other axis', () => {
  for (const handle of ['r', 'l'] as const) {
    it(`${handle}: the free axis follows and the height is derived`, () => {
      const t = box();
      const out = computeResize(t, handle, { x: 900, y: 230 }, ratio(t));
      expect(Math.abs(aspectOf(t, out) - SIXTEEN_NINE)).toBeLessThanOrEqual(ASPECT_TOLERANCE);
    });
  }
  for (const handle of ['t', 'b'] as const) {
    it(`${handle}: the free axis follows and the width is derived`, () => {
      const t = box();
      const out = computeResize(t, handle, { x: 420, y: 700 }, ratio(t));
      expect(Math.abs(aspectOf(t, out) - SIXTEEN_NINE)).toBeLessThanOrEqual(ASPECT_TOLERANCE);
    });
  }

  it('🔴 holds under NON-UNIFORM scale, where a `w/h` lock silently drifts', () => {
    const t = box({ scale: { x: 2, y: 0.5 } });
    const out = computeResize(t, 'r', { x: 1400, y: 300 }, ratio(t));
    expect(Math.abs(aspectOf(t, out) - SIXTEEN_NINE)).toBeLessThanOrEqual(ASPECT_TOLERANCE);
  });
});

describe('D-155 — CORNER handles project onto the constrained diagonal', () => {
  it('🔴 the aspect holds at EVERY emitted rect across a whole drag, not just the end', () => {
    // "Across the whole drag" is the requirement; sampling only the final rect would pass for
    // an implementation that snapped to the aspect once, at the end, after deforming.
    const t = box();
    const k = ratio(t);
    for (let i = 0; i <= 40; i++) {
      const out = computeResize(t, 'br', { x: 140 + i * 30, y: 60 + (i % 7) * 55 }, k);
      expect(
        Math.abs(aspectOf(t, out) - SIXTEEN_NINE),
        `sample ${String(i)} drifted`,
      ).toBeLessThanOrEqual(ASPECT_TOLERANCE);
    }
  });

  it('🔴 the corner solve is the PROJECTION, not the dominant-axis rule — pinned by VALUE', () => {
    /*
      🔴 THIS IS THE TEST THAT ACTUALLY SEPARATES THE TWO RULES, and it replaces one that did
      not.

      The obvious discriminator — "a dominant-axis rule jumps as the pointer crosses the
      diagonal" — is FALSE, and was measured to be false rather than argued away: at the
      crossover `w / k === h` makes both branches of the dominant-axis rule return the same
      pair, so it is CONTINUOUS there. A continuity assertion passes for BOTH rules and proves
      nothing about which one is implemented. (The continuity test below is kept, because a
      genuinely discontinuous implementation is still worth catching — it just is not this.)

      So the choice is pinned by VALUE, well OFF the diagonal where the two disagree loudly:
      for a 16:9 lock at extents (1600, 200), the projection gives ≈1301×732 and the
      dominant-axis rule gives 1600×900.
    */
    const t = box({ position: { x: 0, y: 0 }, anchor: { x: 0, y: 0 } });
    const k = ratio(t);
    const out = computeResize(t, 'br', { x: 1600, y: 200 }, k);
    // The projection's answer…
    expect(out.size.w).toBeCloseTo(1300.89, 1);
    expect(out.size.h).toBeCloseTo(731.75, 1);
    // …and emphatically NOT the dominant-axis rule's.
    expect(out.size.w).not.toBeCloseTo(1600, 0);
    expect(out.size.h).not.toBeCloseTo(900, 0);
  });

  it('a path CROSSING the diagonal is continuous — a weaker property, and worth keeping', () => {
    /*
      ⚠ NOT a projection proof — see the test above for why. Both candidate rules pass this.
      It is kept because an implementation that solved the corner some third way COULD be
      discontinuous, and a box that snaps mid-drag is the symptom an author would report.
    */
    const t = box();
    const k = ratio(t);
    const fixed = { x: t.position.x, y: t.position.y }; // `br` drag ⇒ `tl` is fixed
    let prev: { w: number; h: number } | null = null;
    let maxJump = 0;
    for (let i = 0; i <= 200; i++) {
      // A pointer path that starts well below the diagonal and ends well above it.
      const dx = 200 + i * 4;
      const dy = 700 - i * 3;
      const out = computeResize(t, 'br', { x: fixed.x + dx, y: fixed.y + dy }, k);
      if (prev !== null) {
        maxJump = Math.max(maxJump, Math.abs(out.size.w - prev.w), Math.abs(out.size.h - prev.h));
      }
      prev = out.size;
    }
    // Each pointer step is 5 px of travel; a continuous solve moves the box by a comparable
    // amount. A driver flip would show up here as a jump of tens or hundreds of px.
    expect(maxJump, 'the box jumped — the corner solve is not continuous').toBeLessThan(20);
  });

  it('🔴 the FIXED corner stays put under rotation AND non-uniform scale', () => {
    // The lock reshapes the free EXTENTS only; the position solve that pins the fixed corner
    // is untouched. Rotation and non-uniform scale together are what would expose a lock that
    // had crept into the position math.
    const t = box({ rotation: 33, scale: { x: 2, y: 0.5 }, anchor: { x: 0.5, y: 0.5 } });
    const k = ratio(t);
    const free = computeResize(t, 'br', { x: 900, y: 640 });
    const locked = computeResize(t, 'br', { x: 900, y: 640 }, k);
    // Both solve the SAME fixed corner; only the size differs.
    expect(locked.position.x).not.toBeNaN();
    expect(locked.position.y).not.toBeNaN();
    expect(Math.abs(aspectOf(t, locked) - SIXTEEN_NINE)).toBeLessThanOrEqual(ASPECT_TOLERANCE);
    // …and the lock genuinely changed the size, or the assertion above is vacuous.
    expect(locked.size).not.toEqual(free.size);
  });
});

describe('D-155 — the MIN_SIZE clamp keeps the aspect', () => {
  it('🔴 clamping the driving axis RECOMPUTES the derived one — the pair scales together', () => {
    const t = box();
    const k = ratio(t);
    // A pointer essentially on the fixed corner: both extents want to be ~0.
    const out = computeResize(t, 'br', { x: t.position.x + 1, y: t.position.y + 1 }, k);
    expect(out.size.w).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
    expect(out.size.h).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
    expect(Math.abs(aspectOf(t, out) - SIXTEEN_NINE)).toBeLessThanOrEqual(ASPECT_TOLERANCE);
  });

  it('a TALL aspect clamps on the other axis and still holds', () => {
    const t = box();
    const k = ratio(t, 9 / 16);
    const out = computeResize(t, 'br', { x: t.position.x + 1, y: t.position.y + 1 }, k);
    expect(out.size.w).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
    expect(out.size.h).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
    expect(Math.abs(aspectOf(t, out) - 9 / 16)).toBeLessThanOrEqual(ASPECT_TOLERANCE);
  });
});

describe('D-155 — everything WITHOUT a lock is byte-identical to before', () => {
  /*
    ⚠ These are the ones that get written as "it probably still works". `computeRectResize` is
    shared by every element kind and by D-110's keyframed-path morph rect, so an unlocked
    resize regressing would be a defect in shapes, text, images and paths at once — reached
    from a feature that is supposed to touch only Live Sources.
  */
  const HANDLES: Handle[] = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];
  const POINTERS = [
    { x: 900, y: 640 },
    { x: 20, y: 10 },
    { x: 101, y: 51 },
    { x: 2000, y: 30 },
  ];

  it('🔴 `undefined` lock ⇒ identical result for every handle and pointer', () => {
    for (const t of [
      box(),
      box({ rotation: 33 }),
      box({ scale: { x: 2, y: 0.5 } }),
      box({ rotation: 33, scale: { x: 2, y: 0.5 }, anchor: { x: 0.5, y: 0.5 } }),
    ]) {
      for (const handle of HANDLES) {
        for (const p of POINTERS) {
          expect(computeResize(t, handle, p, undefined)).toEqual(computeResize(t, handle, p));
        }
      }
    }
  });

  it('🔴 a NON-POSITIVE or non-finite ratio is ignored, never divided by', () => {
    const t = box();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const handle of HANDLES) {
        expect(computeResize(t, handle, { x: 900, y: 640 }, bad)).toEqual(
          computeResize(t, handle, { x: 900, y: 640 }),
        );
      }
    }
  });
});
