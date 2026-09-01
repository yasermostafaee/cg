import { describe, expect, it } from 'vitest';
import {
  fitPictureToBox,
  liveSourceFit,
  outputLetterbox,
  outputScale,
  outputTranslate,
  type LiveFitMode,
  type Position,
  type Raster,
} from '@cg/shared-schema';

/**
 * ⭐ **`C-028` — THE TWO-AXIS TEST: the SURFACE and the WIRE, for ONE input, in ONE test.**
 *
 * ── WHY THIS FILE EXISTS AND WHY IT IS HERE ─────────────────────────────────
 *
 * The mask hole is built in `@cg/shared-schema` and applied by `@cg/template-runtime`;
 * the `MIXER FILL`/`CLIP` are built in `@cg/shared-schema` and sent by
 * `tools/caspar-bridge`. Each side has its own tests, and each side's tests pass while
 * the two describe DIFFERENT RECTANGLES — which is exactly the state `B-149` shipped:
 * the arrangement mask punched every hole at the cell's position and the AUTHORED size,
 * opening the live layer where no box existed. On-air crosstalk, fixed 2026-08-19.
 *
 * 🔴 **NOTHING ERRORS WHEN THEY DISAGREE.** The hole is transparent, so a picture that
 * lands beside it looks like a mis-authored template: no exception, no refusal, no
 * operator signal. There is no other mechanism in the system that would catch it — which
 * is why the claim has to be asserted ACROSS the boundary rather than on either side of
 * it, and why it is asserted for the same plate, in the same units, in one place.
 *
 * This package is the home because it is the only one that can see both halves without
 * either importing the other: `@cg/template-runtime` and `tools/caspar-bridge` are
 * siblings, and 6.2b's contract test already lives here for that same reason.
 *
 * ── HOW THE TWO SIDES ARE BROUGHT INTO ONE SPACE ────────────────────────────
 *
 * The mask hole is in SCENE pixels (pulled back into the masked element's own box); the
 * wire is CHANNEL-NORMALIZED. They are compared in RASTER PIXELS, mapping each through
 * the transform its own side actually uses — never by re-deriving one from the other,
 * which would prove only that the TEST agrees with itself.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const SCENE_RES = { width: 1920, height: 1080 };

/**
 * 🔴 **THE DIVERGING FIXTURE.** A 4:3 BOX with a 16:9 SOURCE — chosen so `contain` and
 * `cover` disagree on both POSITION and SIZE, on both axes. A fixture whose box and
 * source already agree would pass under either mode, which is a test of nothing.
 *
 * The backdrop is FULL-FRAME and at the origin, so the mask's pull-back into its local
 * box is the identity and the hole reads directly in scene px. That keeps the assertion
 * about the FIT rather than about the flattener, which `scene-flatten.test.ts` owns.
 */
const PLATE_BOX = box(460, 240, 800, 600);
const SOURCE_ASPECT = 16 / 9;

/** The four rasters 6.2b uses — two of them non-16:9, where `s` and `pad` do not vanish. */
const RASTERS: readonly { name: string; raster: Raster }[] = [
  { name: '1920×1080 (reference — s=1, pad=0)', raster: { width: 1920, height: 1080 } },
  { name: '1280×720 (16:9 — s=2/3, pad=0)', raster: { width: 1280, height: 720 } },
  { name: '1440×1080 (4:3 — pads on Y)', raster: { width: 1440, height: 1080 } },
  { name: '720×576 (PAL — pads on X)', raster: { width: 720, height: 576 } },
];

const CENTRED: Position = { anchor: 'center', offset: { x: 0, y: 0 } };

/** Scene px → raster px, through the SAME terms the page's transform composes from. */
function sceneRectToRaster(
  r: { x: number; y: number; width: number; height: number },
  raster: Raster,
  position: Position,
): { x: number; y: number; width: number; height: number } {
  const s = outputScale(raster);
  const pad = outputLetterbox(raster);
  const t = outputTranslate({ resolution: SCENE_RES }, position);
  return {
    x: pad.x + s * (t.x + r.x),
    y: pad.y + s * (t.y + r.y),
    width: s * r.width,
    height: s * r.height,
  };
}

/** Channel-normalized → raster px. Per axis, which is the measured basis. */
const denormalize = (
  r: { x: number; y: number; width: number; height: number },
  raster: Raster,
) => ({
  x: r.x * raster.width,
  y: r.y * raster.height,
  width: r.width * raster.width,
  height: r.height * raster.height,
});

const expectRect = (
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
  label: string,
): void => {
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(actual[k], `${label}.${k}`).toBeCloseTo(expected[k], 6);
  }
};

/*
 * 🔴 **`single-clock-look-switch` — `pageHole` IS GONE, and with it the AGREEMENT half of
 * this file.**
 *
 * `C-028`'s claim was that the hole the PAGE punched and the `MIXER CLIP` the BRIDGE sent
 * were one computation, and it was proved by computing both and comparing them. The page has
 * no holes now — a plate-bearing package is composited BELOW its plates — so there is ONE
 * computation left and nothing for it to agree with.
 *
 * ⚠ **What must NOT be lost with it is the VALUES**, and that is why this file survives
 * rather than being deleted: the wire-side assertions below still pin `contain` against
 * `cover` on BOTH position and size, at four rasters, which is the D.4 one-axis
 * discrimination this suite exists for. The `fitPictureToBox` equivariance at the end is the
 * property that lets the fit be computed in either space at all.
 */
describe('C-028 — the fit the WIRE carries, pinned per mode and per raster', () => {
  /*
    🔴 **PER RASTER, and this is the coverage `single-clock-look-switch` had to KEEP.**

    The agreement test that stood here compared the page's hole with the wire's clip at four
    rasters, two of them non-16:9 where the scene→raster scale and the pillar/letterbox pad do
    not vanish. The page half is gone; the RASTERS are not, because the mapping they exercise
    is the one that reaches air. `contain` and `cover` must disagree on BOTH position and size
    at every one of them — a suite that only ran 1920×1080 would pass with `pad` dropped.
  */
  describe.each(RASTERS)('$name', ({ raster }) => {
    it('contain and cover differ on BOTH position and size, on the wire', () => {
      const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
      const common = { rect, sceneResolution: SCENE_RES, raster, position: CENTRED } as const;
      const contain = liveSourceFit({ ...common, sourceAspect: SOURCE_ASPECT, fitMode: 'contain' });
      const cover = liveSourceFit({ ...common, sourceAspect: SOURCE_ASPECT, fitMode: 'cover' });
      // `contain` fits the picture inside the box; `cover` overfills it and clips back.
      expect(denormalize(contain.fill, raster).height).toBeLessThan(
        denormalize(cover.fill, raster).height,
      );
      expect(denormalize(contain.fill, raster).y).not.toBeCloseTo(
        denormalize(cover.fill, raster).y,
        3,
      );
      // …and under `cover` the CLIP is what holds the picture at the box.
      expect(contain.clip).not.toEqual(cover.clip);
    });
  });

  /**
   * 🔴 THE VALUES, PINNED — and pinned where the two candidate implementations DIVERGE.
   *
   * The agreement above would also hold if BOTH sides were wrong in the same way (both
   * punching the box, say). These assertions say which rect is the right one, in numbers
   * that differ between the modes on every component.
   */
  it('the values themselves differ per mode, on BOTH position and size', () => {
    /*
      Read off the WIRE's `CLIP`, which is the rect the picture actually occupies on the
      channel, rather than off a hole. Same numbers as before, same discrimination: a suite
      that only compared two implementations would pass with both of them wrong.
    */
    const raster: Raster = { width: 1920, height: 1080 };
    const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    const common = { rect, sceneResolution: SCENE_RES, raster, position: CENTRED } as const;
    const visibleOf = (
      mode: LiveFitMode,
    ): { x: number; y: number; width: number; height: number } =>
      sceneRectToRaster(fitPictureToBox(rect, SOURCE_ASPECT, mode).visible, raster, CENTRED);
    // 800×600 box (4:3) with a 16:9 source. `contain` ⇒ 800×450, centred: y 240+75=315.
    const contain = visibleOf('contain');
    expectRect(contain, { x: 460, y: 315, width: 800, height: 450 }, 'contain visible');
    // `cover` ⇒ the picture is 1066.67×600 and what is SEEN stays at the box.
    const cover = visibleOf('cover');
    expectRect(
      cover,
      { x: 460, y: 240, width: 800, height: 600 },
      'cover visible — the box itself',
    );
    // …so a test that passed under both would have tested nothing.
    expect(contain.y).not.toBeCloseTo(cover.y, 3);
    expect(contain.height).not.toBeCloseTo(cover.height, 3);
    // And the wire agrees with it, which is the claim that reaches air.
    const wire = liveSourceFit({ ...common, sourceAspect: SOURCE_ASPECT, fitMode: 'contain' });
    expectRect(denormalize(wire.clip as NonNullable<typeof wire.clip>, raster), contain, 'clip');
  });

  it('the FILL is what differs on the wire — oversized under cover, fitted under contain', () => {
    const raster: Raster = { width: 1920, height: 1080 };
    const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    const common = { rect, sceneResolution: SCENE_RES, raster, position: CENTRED } as const;
    const contain = liveSourceFit({ ...common, sourceAspect: SOURCE_ASPECT, fitMode: 'contain' });
    const cover = liveSourceFit({ ...common, sourceAspect: SOURCE_ASPECT, fitMode: 'cover' });

    // `contain`: the fill IS the visible rect — nothing is cropped.
    expectRect(
      denormalize(contain.fill, raster),
      denormalize(contain.clip as NonNullable<typeof contain.clip>, raster),
      'contain fill vs clip',
    );
    // `cover`: the fill EXCEEDS its clip on the wide axis — that overflow is the crop.
    expect(denormalize(cover.fill, raster).width).toBeGreaterThan(
      denormalize(cover.clip as NonNullable<typeof cover.clip>, raster).width,
    );
  });

  /**
   * 🔴 THE POSITIVE CONTROL — C-028's regression bullet, across BOTH axes at once.
   *
   * A plate whose aspect MATCHES its box must be byte-identical to today: same hole,
   * same fill, same clip, in both modes. This is what makes the default flip safe for
   * every scene the change promised not to touch, and it is not optional.
   */
  it('a MATCHING aspect is identical in both modes, on the wire', () => {
    const raster: Raster = { width: 1920, height: 1080 };
    // The box is 800×600 — a 4:3 box. Feed it a 4:3 source.
    const matched = 4 / 3;
    const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    const common = { rect, sceneResolution: SCENE_RES, raster, position: CENTRED } as const;
    const wireContain = liveSourceFit({ ...common, sourceAspect: matched, fitMode: 'contain' });
    const wireCover = liveSourceFit({ ...common, sourceAspect: matched, fitMode: 'cover' });
    expect(wireContain).toEqual(wireCover);
    expectRect(
      denormalize(wireContain.fill, raster),
      { x: 460, y: 240, width: 800, height: 600 },
      'a matching aspect leaves the box alone',
    );
  });

  it('NO stated aspect ⇒ no fit on either axis, in either mode (D-147, unchanged)', () => {
    const raster: Raster = { width: 1920, height: 1080 };
    const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    for (const mode of ['contain', 'cover'] as const) {
      const wire = liveSourceFit({
        rect,
        sceneResolution: SCENE_RES,
        raster,
        position: CENTRED,
        sourceAspect: null,
        fitMode: mode,
      });
      expectRect(
        denormalize(wire.fill, raster),
        { x: 460, y: 240, width: 800, height: 600 },
        `${mode} fill with no aspect`,
      );
    }
  });

  /*
   * 🔴 **`single-clock-look-switch` — the two PAGE-FALLBACK tests are GONE with the fallback.**
   *
   * They asserted that a page with no bridge facts punched from the AUTHOR's `expectedAspect`,
   * and that bridge facts outranked it. Both were properties of `CgControl.plates`, which
   * existed so the page could fit its own holes; the page has no holes and is told no fits.
   * `D-147`'s precedence itself is unchanged and is enforced where it now matters — in the
   * bridge's own plan (`resolvePlateAspect`), tested in `@cg/caspar-bridge`.
   */

  /**
   * The equivariance that lets the two sides work in two spaces at all, asserted here
   * against the REAL page/wire pair rather than only against the pure function.
   */
  it('the same fit is reached whether it is computed in scene px or raster px', () => {
    const raster: Raster = { width: 720, height: 576 };
    const sceneBox = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    for (const mode of ['contain', 'cover'] as const) {
      const inScene = fitPictureToBox(sceneBox, SOURCE_ASPECT, mode);
      const inRaster = fitPictureToBox(
        sceneRectToRaster(sceneBox, raster, CENTRED),
        SOURCE_ASPECT,
        mode,
      );
      expectRect(
        sceneRectToRaster(inScene.visible, raster, CENTRED),
        inRaster.visible,
        `${mode} visible`,
      );
    }
  });
});

/** `{ w, h }` → `{ width, height }`, which is the shape the geometry takes. */
function sizeOf(t: ReturnType<typeof box>): { width: number; height: number } {
  return { width: t.size.w, height: t.size.h };
}
