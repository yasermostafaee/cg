// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  liveSourceFit,
  scenePointOnRaster,
  type LiveSourceRect,
  type Position,
  type Raster,
  type Scene,
} from '@cg/shared-schema';
import { applyOutputPosition } from '../src/position.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * C-015 phase 6 (task 6.2b) — **THE DUPLICATION GUARD'S TEETH.**
 *
 * 6.2a moved the shared placement TERMS into one package, which makes them
 * impossible to diverge. It does NOT make their COMPOSITION agree: the page composes
 * a CSS transform and the bridge composes a channel-normalized rect, and neither can
 * share that last step. This file pins the two compositions to each other.
 *
 * 🔴 **WHY IT MATTERS MORE THAN AN ORDINARY TEST.** If the two ever disagree,
 * NOTHING ERRORS. The hole in the template is transparent, so a live picture that
 * lands beside it looks exactly like a mis-authored template — no exception, no
 * refusal, no operator signal, and the natural response is to go and edit the scene.
 * There is no other mechanism in the system that would catch it.
 *
 * 🔴 **AND WHY THE NON-16:9 RASTERS ARE THE WHOLE POINT.** On a 16:9 raster
 * `outputScale` is exactly 1 and `outputLetterbox` is exactly (0,0), so `s` and `pad`
 * vanish from both sides and the test would pass against an implementation that
 * omitted them entirely — which is precisely the naive
 * `rect.x / scene.resolution.width` form design.md §6 forbids, and which is wrong by
 * a fifth of the frame on a 4:3 raster. A 16:9-only table here would be a test that
 * passes for the wrong reason; this project shipped three of those in one week.
 *
 * So the table carries `1440×1080` (pads on Y — the case already pinned page-side in
 * `output-position.test.ts`) and `720×576` (pads on X, the other axis), beside the
 * 16:9 no-regression cases.
 *
 * ── HOW THE PAGE SIDE IS OBTAINED ──────────────────────────────────────────
 *
 * By CALLING `applyOutputPosition` and reading the transform it actually wrote, then
 * applying that transform to a scene-px point. Not by re-deriving the page's maths in
 * the test: a test that re-derives one side proves the two derivations in the TEST
 * agree, which is the one thing nobody needs to know.
 */

/** The four rasters, chosen so `s` and `pad` are non-trivial on two of them. */
const RASTERS: readonly { name: string; raster: Raster }[] = [
  {
    name: '1920×1080 (reference — s=1, pad=0, the no-regression case)',
    raster: { width: 1920, height: 1080 },
  },
  { name: '1280×720 (16:9 — s=2/3, pad=0)', raster: { width: 1280, height: 720 } },
  {
    name: '1440×1080 (4:3 — s=0.75, pad=(0,135): pads on Y)',
    raster: { width: 1440, height: 1080 },
  },
  { name: '720×576 (PAL — pads on X, the OTHER axis)', raster: { width: 720, height: 576 } },
];

const POSITIONS: readonly { name: string; position: Position }[] = [
  { name: 'centred, no offset', position: { anchor: 'center', offset: { x: 0, y: 0 } } },
  { name: 'top-left, no offset', position: { anchor: 'top-left', offset: { x: 0, y: 0 } } },
  { name: 'bottom-right, no offset', position: { anchor: 'bottom-right', offset: { x: 0, y: 0 } } },
  { name: 'mid-right, nudged', position: { anchor: 'mid-right', offset: { x: -40, y: 17 } } },
];

const SCENES: readonly { name: string; resolution: { width: number; height: number } }[] = [
  { name: 'full-frame 1920×1080', resolution: { width: 1920, height: 1080 } },
  { name: 'small-canvas 960×540', resolution: { width: 960, height: 540 } },
  { name: 'odd 1000×700', resolution: { width: 1000, height: 700 } },
];

const HOLE: LiveSourceRect = { x: 100, y: 60, width: 480, height: 270 };

/** See the note at the assertions: derived from the page's 6-decimal CSS rounding. */
const PIXEL_TOLERANCE = 0.01;

/**
 * Compose the page's transform by CALLING it, then apply it to a scene-px point.
 *
 * `applyOutputPosition` writes either `translate(...)` alone (the 16:9 fast path,
 * deliberately byte-identical to the pre-R-030 output) or
 * `translate(pad) scale(s) translate(anchor)`. Both are parsed here from the string
 * the page actually wrote — so a change to WHICH form it emits is caught too.
 */
function pageMapsScenePoint(
  scene: Scene,
  raster: Raster,
  position: Position,
  point: { x: number; y: number },
): { x: number; y: number } {
  document.body.innerHTML = '<div class="cg-stage"></div>';
  const search = `?pos=${position.anchor}&dx=${String(position.offset.x)}&dy=${String(position.offset.y)}&cw=${String(raster.width)}&ch=${String(raster.height)}`;
  applyOutputPosition(scene, { search, view: null });
  const transform = document.querySelector<HTMLElement>('.cg-stage')?.style.transform ?? '';

  // Parse right-to-left, exactly as CSS composes: the LAST translate is applied to
  // the point first, then the scale, then the leading translate.
  const translates = [...transform.matchAll(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/g)];
  const scaleMatch = /scale\(([-\d.]+)\)/.exec(transform);
  expect(translates.length, `no translate in "${transform}"`).toBeGreaterThan(0);

  const anchor = translates[translates.length - 1] as RegExpMatchArray;
  const s = scaleMatch === null ? 1 : Number(scaleMatch[1]);
  const pad = translates.length > 1 ? (translates[0] as RegExpMatchArray) : ['', '0', '0'];

  return {
    x: Number(pad[1]) + s * (Number(anchor[1]) + point.x),
    y: Number(pad[2]) + s * (Number(anchor[2]) + point.y),
  };
}

describe('C-015 6.2b — the bridge’s FILL and the page’s transform place the same point', () => {
  for (const { name: rasterName, raster } of RASTERS) {
    for (const { name: posName, position } of POSITIONS) {
      for (const { name: sceneName, resolution } of SCENES) {
        it(`${rasterName} · ${posName} · ${sceneName}`, () => {
          const scene: Scene = { ...lowerThirdScene, id: 'scene-contract', resolution };

          // The BRIDGE side: the hole's normalized FILL, de-normalized back to
          // raster px. No crop, so the fill IS the hole — this test is about
          // placement, and the aspect fit is exercised on its own below.
          const fit = liveSourceFit({
            rect: HOLE,
            sceneResolution: resolution,
            raster,
            position,
            sourceAspect: null,
          });
          const bridgeTopLeft = { x: fit.fill.x * raster.width, y: fit.fill.y * raster.height };
          const bridgeBottomRight = {
            x: (fit.fill.x + fit.fill.width) * raster.width,
            y: (fit.fill.y + fit.fill.height) * raster.height,
          };

          // The PAGE side: the same two scene-px corners, through the transform the
          // page actually wrote.
          const pageTopLeft = pageMapsScenePoint(scene, raster, position, {
            x: HOLE.x,
            y: HOLE.y,
          });
          const pageBottomRight = pageMapsScenePoint(scene, raster, position, {
            x: HOLE.x + HOLE.width,
            y: HOLE.y + HOLE.height,
          });

          // THE TOLERANCE IS STATED IN RASTER PIXELS, and it is derived rather
          // than picked: the page rounds its CSS to 6 decimals, so a scale of 2/3
          // reaches the transform as 0.666667 and a scene coordinate of up to ~1920
          // inherits an error of up to 1920 x 1e-6 ~= 0.002 px, plus ~1e-6 from the
          // translate. A hundredth of a pixel is therefore the tightest HONEST
          // bound, and it is four orders of magnitude below anything that could
          // misplace a graphic — the failure this file exists for is a fifth of a
          // FRAME. Asserting in pixels rather than in decimal places also keeps the
          // claim readable: 'the two agree to within a hundredth of a pixel'.
          expect(Math.abs(bridgeTopLeft.x - pageTopLeft.x)).toBeLessThan(PIXEL_TOLERANCE);
          expect(Math.abs(bridgeTopLeft.y - pageTopLeft.y)).toBeLessThan(PIXEL_TOLERANCE);
          expect(Math.abs(bridgeBottomRight.x - pageBottomRight.x)).toBeLessThan(PIXEL_TOLERANCE);
          expect(Math.abs(bridgeBottomRight.y - pageBottomRight.y)).toBeLessThan(PIXEL_TOLERANCE);
        });
      }
    }
  }

  it('🔴 the NAIVE form disagrees on a 4:3 raster — the table has teeth', () => {
    // The guard on the guard. Every assertion above would also pass against an
    // implementation that dropped `s`, `pad` and the anchor translate IF the table
    // were 16:9-only. This shows the 4:3 row is what makes them bite, using
    // design.md §6's own worked example.
    const resolution = { width: 960, height: 540 };
    const raster: Raster = { width: 1440, height: 1080 };
    const position: Position = { anchor: 'center', offset: { x: 0, y: 0 } };
    const fit = liveSourceFit({
      rect: { x: 100, y: 0, width: 100, height: 100 },
      sceneResolution: resolution,
      raster,
      position,
      sourceAspect: null,
    });
    // The chain's answer, quoted in the design.
    expect(fit.fill.x).toBeCloseTo(0.302083, 5);
    // The naive `rect.x / scene.resolution.width`, which C-015's original wording
    // used: wrong by a fifth of the frame width.
    expect(100 / resolution.width).toBeCloseTo(0.104167, 5);
    expect(Math.abs(fit.fill.x - 100 / resolution.width)).toBeGreaterThan(0.19);
  });

  it('and the same point on 16:9, where the naive form ACCIDENTALLY agrees', () => {
    // Stated explicitly so nobody "simplifies" the chain after testing on the
    // plant's own 16:9 channel and finding both forms identical.
    const resolution = { width: 1920, height: 1080 };
    const fit = liveSourceFit({
      rect: { x: 100, y: 0, width: 100, height: 100 },
      sceneResolution: resolution,
      raster: { width: 1920, height: 1080 },
      position: { anchor: 'center', offset: { x: 0, y: 0 } },
      sourceAspect: null,
    });
    expect(fit.fill.x).toBeCloseTo(100 / 1920, 10);
  });

  it('scenePointOnRaster is the SAME chain the fill is built from', () => {
    // It exists for this test, so it must not become a second derivation.
    const resolution = { width: 960, height: 540 };
    const raster: Raster = { width: 720, height: 576 };
    const position: Position = { anchor: 'top-left', offset: { x: 12, y: -8 } };
    const fit = liveSourceFit({
      rect: HOLE,
      sceneResolution: resolution,
      raster,
      position,
      sourceAspect: null,
    });
    const point = scenePointOnRaster(
      { x: HOLE.x, y: HOLE.y },
      { sceneResolution: resolution, raster, position },
    );
    expect(fit.fill.x * raster.width).toBeCloseTo(point.x, 10);
    expect(fit.fill.y * raster.height).toBeCloseTo(point.y, 10);
  });
});
