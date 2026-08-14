import { describe, expect, it } from 'vitest';
import { liveSourceFit, type LiveSourceFitInput } from '../src/live-geometry.js';

/**
 * C-015 phase 6 — the plate geometry: crop-to-fill (6.3) and the scene-rect clamp
 * (6.4).
 *
 * The placement half is pinned against the PAGE in
 * `packages/template-runtime/tests/live-source-fill-contract.test.ts` (6.2b), which
 * is where it belongs — it is a claim about two implementations agreeing. What is
 * here is the part that has no page counterpart: how the picture is fitted into the
 * hole, and what happens at the edge of the scene.
 */

/** A 1920×1080 scene on a 1920×1080 raster, centred — so `s = 1`, `pad = 0` and the
 *  arithmetic under test is the FIT rather than the placement. */
const base = (over: Partial<LiveSourceFitInput> = {}): LiveSourceFitInput => ({
  rect: { x: 460, y: 270, width: 1000, height: 500 },
  sceneResolution: { width: 1920, height: 1080 },
  raster: { width: 1920, height: 1080 },
  position: { anchor: 'center', offset: { x: 0, y: 0 } },
  sourceAspect: null,
  ...over,
});

/**
 * Compare a raster-px rect field by field with a sub-thousandth-pixel tolerance.
 *
 * NOT `toEqual`: every rect here has been divided by the raster and multiplied back,
 * so a value that is mathematically 1000 arrives as 1000.0000000000001. Asserting
 * exact equality would make these tests fail on float noise rather than on geometry,
 * and the natural repair — rounding inside the production code — would hide real
 * error instead of exposing it.
 */
const expectRect = (
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
): void => {
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(actual[k], k).toBeCloseTo(expected[k], 6);
  }
};

/** De-normalize a rect back to raster px, so assertions read in the unit that matters. */
const px = (
  r: { x: number; y: number; width: number; height: number },
  raster = { width: 1920, height: 1080 },
) => ({
  x: r.x * raster.width,
  y: r.y * raster.height,
  width: r.width * raster.width,
  height: r.height * raster.height,
});

describe('crop-to-fill (6.3) — cover the hole, keep the proportions, mask the overflow', () => {
  it('a source WIDER than the hole overflows HORIZONTALLY, matched on height', () => {
    // Hole 1000×500 (aspect 2). A 16:9 source (1.778) is NARROWER, so this case is
    // the other one — use 2.5 to get a genuinely wider source.
    const fit = liveSourceFit(base({ sourceAspect: 2.5 }));
    const fill = px(fit.fill);
    // Heights match: the covering scale is set by the axis that needs the most.
    expect(fill.height).toBeCloseTo(500, 6);
    expect(fill.width).toBeCloseTo(1250, 6);
    // …and it is CENTRED on the hole, so the crop takes evenly from both edges. An
    // off-centre crop would cut one side of a face and not the other.
    expect(fill.x).toBeCloseTo(460 - 125, 6);
    expect(fill.y).toBeCloseTo(270, 6);
  });

  it('a source NARROWER than the hole overflows VERTICALLY, matched on width', () => {
    // 16:9 source into a 2:1 hole: the source is relatively taller, so widths match.
    const fit = liveSourceFit(base({ sourceAspect: 16 / 9 }));
    const fill = px(fit.fill);
    expect(fill.width).toBeCloseTo(1000, 6);
    expect(fill.height).toBeCloseTo(562.5, 6);
    expect(fill.x).toBeCloseTo(460, 6);
    expect(fill.y).toBeCloseTo(270 - 31.25, 6);
  });

  it('🔴 it COVERS and never fits-inside — pillarbox is not reachable from this code', () => {
    // The rejected option, asserted as unreachable rather than argued in a comment.
    // Pillarbox would use `min` where this uses `max`; the observable difference is
    // that the fill would be SMALLER than the hole on one axis, leaving bars inside
    // a frame the designer drew — which reads on air as a fault, not as a 4:3 feed.
    for (const aspect of [0.5, 1, 4 / 3, 16 / 9, 2.5, 4]) {
      const fill = px(liveSourceFit(base({ sourceAspect: aspect })).fill);
      expect(fill.width, `aspect ${String(aspect)}`).toBeGreaterThanOrEqual(1000 - 1e-9);
      expect(fill.height, `aspect ${String(aspect)}`).toBeGreaterThanOrEqual(500 - 1e-9);
    }
  });

  it('an EXACTLY matching aspect crops nothing — the fill IS the hole', () => {
    const fill = px(liveSourceFit(base({ sourceAspect: 2 })).fill);
    expectRect(fill, { x: 460, y: 270, width: 1000, height: 500 });
  });

  it('the CLIP is the hole, whatever the crop did to the fill', () => {
    // The mask is what decides what is SEEN, so it stays on the authored rect while
    // the fill grows past it. This is the pairing `mixerFit` emits together.
    for (const aspect of [null, 16 / 9, 2.5]) {
      const fit = liveSourceFit(base({ sourceAspect: aspect }));
      expect(fit.clip, `aspect ${String(aspect)}`).not.toBeNull();
      expectRect(px(fit.clip as NonNullable<typeof fit.clip>), {
        x: 460,
        y: 270,
        width: 1000,
        height: 500,
      });
    }
  });

  it('🔴 ZERO IS FALSY — a null aspect means NO CROP and is tested with ===', () => {
    // `sourceAspect: null` is "nothing in the chain states one", and it must not be
    // confused with 0. An aspect of 0 is not a legal aspect but IS falsy, so a
    // truthiness test would read it as "no aspect" and silently stretch instead of
    // failing where the caller can see it.
    expectRect(px(liveSourceFit(base({ sourceAspect: null })).fill), {
      x: 460,
      y: 270,
      width: 1000,
      height: 500,
    });
    // A degenerate 0 is refused by the same guard rather than dividing by zero.
    const zero = px(liveSourceFit(base({ sourceAspect: 0 })).fill);
    expect(Number.isFinite(zero.width)).toBe(true);
    expectRect(zero, { x: 460, y: 270, width: 1000, height: 500 });
  });
});

describe('the scene-rect clamp (6.4) — the live source is not clipped by the stage', () => {
  it('a hole running off the scene edge has its CLIP intersected, and its FILL left alone', () => {
    // `.cg-stage` has `overflow:hidden`, so the template's own frame graphic is
    // clipped at the scene edge — but the live layer is a different layer and is not.
    const fit = liveSourceFit(
      base({
        sceneResolution: { width: 960, height: 540 },
        // 960-wide scene, centred on a 1920 raster ⇒ stage occupies x 480…1440.
        rect: { x: 800, y: 100, width: 400, height: 200 },
      }),
    );
    // The FILL is untouched: the picture keeps the scale and position the author
    // drew. Shrinking it here would squash a face into the visible sliver.
    expectRect(px(fit.fill), { x: 480 + 800, y: 270 + 100, width: 400, height: 200 });
    // The CLIP stops at the scene's right edge (scene x=960 ⇒ raster x=1440).
    const clip = px(fit.clip as NonNullable<typeof fit.clip>);
    expect(clip.x).toBeCloseTo(1280, 6);
    expect(clip.width).toBeCloseTo(160, 6);
    expect(clip.height).toBeCloseTo(200, 6);
  });

  it('a hole ENTIRELY outside the scene yields clip `null` — nothing to seat', () => {
    // A first-class answer, not a zero-area rect: `width: 0` reads as "very small"
    // to a naive consumer, which would emit a MIXER CLIP for a box that shows
    // nothing. `null` says there is nothing to put on air at all.
    const fit = liveSourceFit(
      base({
        sceneResolution: { width: 960, height: 540 },
        rect: { x: 1200, y: 100, width: 200, height: 100 },
      }),
    );
    expect(fit.clip).toBeNull();
  });

  it('a hole exactly TOUCHING the scene edge is also `null`, not a zero-width box', () => {
    const fit = liveSourceFit(
      base({
        sceneResolution: { width: 960, height: 540 },
        rect: { x: 960, y: 100, width: 200, height: 100 },
      }),
    );
    expect(fit.clip).toBeNull();
  });

  it('a hole fully inside the scene is NOT clamped — the common case costs nothing', () => {
    const fit = liveSourceFit(base());
    expectRect(px(fit.clip as NonNullable<typeof fit.clip>), {
      x: 460,
      y: 270,
      width: 1000,
      height: 500,
    });
  });

  it('the clamp follows the STAGE, not the raster — a positioned scene moves it', () => {
    // The scene rect is where the stage actually landed, so an anchored/offset
    // template clamps against its own moved box rather than against the frame.
    const fit = liveSourceFit(
      base({
        sceneResolution: { width: 960, height: 540 },
        position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
        rect: { x: 900, y: 100, width: 200, height: 100 },
      }),
    );
    // Stage at raster x 0…960, so the hole is clipped at 960.
    const clip = px(fit.clip as NonNullable<typeof fit.clip>);
    expect(clip.x).toBeCloseTo(900, 6);
    expect(clip.width).toBeCloseTo(60, 6);
  });
});
