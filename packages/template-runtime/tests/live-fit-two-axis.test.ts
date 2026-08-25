import { describe, expect, it } from 'vitest';
import {
  fitPictureToBox,
  liveSourceFit,
  outputLetterbox,
  outputScale,
  outputTranslate,
  sceneMaskHoles,
  type Element,
  type LiveFitMode,
  type PlateFitFacts,
  type Position,
  type Raster,
  type Scene,
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

const baseProps = { opacity: 1, visible: true, locked: false };

function plate(id: string, t: ReturnType<typeof box>, zIndex: number, over = {}): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: t,
    zIndex,
    ...over,
  } as unknown as Element;
}

function backdrop(id: string, t: ReturnType<typeof box>, zIndex: number): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#101820' },
    transform: t,
    zIndex,
  } as unknown as Element;
}

const SCENE_RES = { width: 1920, height: 1080 };

function sceneWith(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-c028',
    name: 'two-axis',
    templateType: 'custom',
    resolution: SCENE_RES,
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

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

/** The hole the PAGE punches for `guest-1`, in scene px. */
function pageHole(
  mode: LiveFitMode,
  aspect: number | null,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const scene = sceneWith([
    backdrop('bg', box(0, 0, SCENE_RES.width, SCENE_RES.height), 0),
    plate('guest-1', PLATE_BOX, 1),
  ]);
  const fits = new Map<string, PlateFitFacts>([['guest-1', { aspect, mode }]]);
  const holes = sceneMaskHoles(scene, undefined, fits);
  const forBackdrop = holes.get('bg');
  // The positive control this whole file rests on: a negative or a comparison against an
  // absent hole is VOID until the instrument is proven live.
  expect(forBackdrop, 'the backdrop must actually be punched').toHaveLength(1);
  return forBackdrop?.[0] as { x: number; y: number; width: number; height: number };
}

describe('C-028 — the mask hole and the wire geometry are ONE computation', () => {
  describe.each(RASTERS)('$name', ({ raster }) => {
    it.each(['contain', 'cover'] as const)(
      '%s — the PAGE’s hole and the BRIDGE’s CLIP are the same rect',
      (mode) => {
        const hole = pageHole(mode, SOURCE_ASPECT);
        const wire = liveSourceFit({
          rect: { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) },
          sceneResolution: SCENE_RES,
          raster,
          position: CENTRED,
          sourceAspect: SOURCE_ASPECT,
          fitMode: mode,
        });
        expect(wire.clip, 'the plate is on the frame, so there IS a clip').not.toBeNull();
        expectRect(
          denormalize(wire.clip as NonNullable<typeof wire.clip>, raster),
          sceneRectToRaster(hole, raster, CENTRED),
          `${mode} clip vs hole`,
        );
      },
    );
  });

  /**
   * 🔴 THE VALUES, PINNED — and pinned where the two candidate implementations DIVERGE.
   *
   * The agreement above would also hold if BOTH sides were wrong in the same way (both
   * punching the box, say). These assertions say which rect is the right one, in numbers
   * that differ between the modes on every component.
   */
  it('the values themselves differ per mode, on BOTH position and size', () => {
    // 800×600 box (4:3) with a 16:9 source. `contain` ⇒ 800×450, centred: y 240+75=315.
    const contain = pageHole('contain', SOURCE_ASPECT);
    expectRect(contain, { x: 460, y: 315, width: 800, height: 450 }, 'contain hole');
    // `cover` ⇒ the picture is 1066.67×600 and the HOLE stays at the box.
    const cover = pageHole('cover', SOURCE_ASPECT);
    expectRect(cover, { x: 460, y: 240, width: 800, height: 600 }, 'cover hole — the box itself');
    // …so a test that passed under both would have tested nothing.
    expect(contain.y).not.toBeCloseTo(cover.y, 3);
    expect(contain.height).not.toBeCloseTo(cover.height, 3);
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
  it('a MATCHING aspect is identical in both modes, on the surface AND on the wire', () => {
    const raster: Raster = { width: 1920, height: 1080 };
    // The box is 800×600 — a 4:3 box. Feed it a 4:3 source.
    const matched = 4 / 3;
    const holeContain = pageHole('contain', matched);
    const holeCover = pageHole('cover', matched);
    expect(holeContain).toEqual(holeCover);
    expectRect(
      holeContain,
      { x: 460, y: 240, width: 800, height: 600 },
      'a matching aspect leaves the box alone',
    );

    const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    const common = { rect, sceneResolution: SCENE_RES, raster, position: CENTRED } as const;
    const wireContain = liveSourceFit({ ...common, sourceAspect: matched, fitMode: 'contain' });
    const wireCover = liveSourceFit({ ...common, sourceAspect: matched, fitMode: 'cover' });
    expect(wireContain).toEqual(wireCover);
  });

  it('NO stated aspect ⇒ no fit on either axis, in either mode (D-147, unchanged)', () => {
    const raster: Raster = { width: 1920, height: 1080 };
    const rect = { x: PLATE_BOX.position.x, y: PLATE_BOX.position.y, ...sizeOf(PLATE_BOX) };
    for (const mode of ['contain', 'cover'] as const) {
      expectRect(
        pageHole(mode, null),
        { x: 460, y: 240, width: 800, height: 600 },
        `${mode} hole with no aspect`,
      );
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

  /**
   * The page's fall-back, asserted at the seam rather than in a comment: with NO facts
   * from the bridge, the hole comes from the SCENE's own statement — the author's
   * `expectedAspect` and `fitMode`. That is what a Designer preview and a page the
   * bridge has not yet spoken to are looking at.
   */
  it('with no bridge facts, the page falls back to what the AUTHOR declared', () => {
    const scene = sceneWith([
      backdrop('bg', box(0, 0, SCENE_RES.width, SCENE_RES.height), 0),
      plate('guest-1', PLATE_BOX, 1, { expectedAspect: SOURCE_ASPECT, fitMode: 'contain' }),
    ]);
    const hole = sceneMaskHoles(scene, undefined, undefined).get('bg')?.[0];
    expectRect(
      hole as NonNullable<typeof hole>,
      { x: 460, y: 315, width: 800, height: 450 },
      'authored contain',
    );

    // …and a plate that declares NOTHING gets no fit at all — the box, exactly as today.
    const bare = sceneWith([
      backdrop('bg', box(0, 0, SCENE_RES.width, SCENE_RES.height), 0),
      plate('guest-1', PLATE_BOX, 1),
    ]);
    const bareHole = sceneMaskHoles(bare, undefined, undefined).get('bg')?.[0];
    expectRect(
      bareHole as NonNullable<typeof bareHole>,
      { x: 460, y: 240, width: 800, height: 600 },
      'undeclared plate',
    );
  });

  /**
   * 🔴 The BRIDGE's facts OUTRANK the author's, and this is the `B-149` guard in one
   * assertion: when the two disagree, the page must punch for the ASSIGNED source, not
   * for what the author guessed. A page that preferred the element would put the hole in
   * one place and the picture in another.
   */
  it('bridge facts OUTRANK the element’s own declaration', () => {
    const scene = sceneWith([
      backdrop('bg', box(0, 0, SCENE_RES.width, SCENE_RES.height), 0),
      // The author designed for a 4:3 feed and asked for `cover`…
      plate('guest-1', PLATE_BOX, 1, { expectedAspect: 4 / 3, fitMode: 'cover' }),
    ]);
    // …but the installation delivers 16:9 and the operator overrode to `contain`.
    const fits = new Map<string, PlateFitFacts>([
      ['guest-1', { aspect: SOURCE_ASPECT, mode: 'contain' }],
    ]);
    const hole = sceneMaskHoles(scene, undefined, fits).get('bg')?.[0];
    expectRect(
      hole as NonNullable<typeof hole>,
      { x: 460, y: 315, width: 800, height: 450 },
      'the bridge’s answer',
    );
  });

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
