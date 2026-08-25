import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_FIT_MODE,
  fitPictureToBox,
  type FitRect,
  type LiveFitMode,
} from '../src/live-fit.js';
import { outputLetterbox, outputScale, outputTranslate, type Raster } from '../src/scene.js';

/** A 4:3 box, chosen so a 16:9 source diverges from it on BOTH axes and both modes. */
const BOX: FitRect = { x: 100, y: 200, width: 400, height: 300 };
const WIDE = 16 / 9;

const close = (a: number, b: number): void => expect(a).toBeCloseTo(b, 6);
const expectRect = (got: FitRect, want: FitRect): void => {
  close(got.x, want.x);
  close(got.y, want.y);
  close(got.width, want.width);
  close(got.height, want.height);
};

describe('C-028 — fitPictureToBox: the ONE fit', () => {
  it('DEFAULTS to contain — the client decision, pinned as a value', () => {
    expect(DEFAULT_LIVE_FIT_MODE).toBe('contain');
  });

  describe('contain — the whole picture, centred, nothing cut', () => {
    it('a WIDER source is scaled to the box WIDTH and centred vertically', () => {
      const { picture, visible } = fitPictureToBox(BOX, WIDE, 'contain');
      // 400 wide ⇒ 225 tall; (300 − 225)/2 = 37.5 of margin top and bottom.
      expectRect(picture, { x: 100, y: 237.5, width: 400, height: 225 });
      // 🔴 The whole picture is visible: `visible` IS the picture, not the box.
      expectRect(visible, picture);
    });

    it('a TALLER source is scaled to the box HEIGHT and centred horizontally', () => {
      const { picture, visible } = fitPictureToBox(BOX, 1 / 2, 'contain');
      // 300 tall ⇒ 150 wide; (400 − 150)/2 = 125 of margin left and right.
      expectRect(picture, { x: 225, y: 200, width: 150, height: 300 });
      expectRect(visible, picture);
    });

    it('never exceeds the box on either axis, over a spread of aspects', () => {
      for (const aspect of [0.4, 0.9, 1, 1.5, WIDE, 2.39, 8]) {
        const { picture } = fitPictureToBox(BOX, aspect, 'contain');
        expect(picture.width).toBeLessThanOrEqual(BOX.width + 1e-9);
        expect(picture.height).toBeLessThanOrEqual(BOX.height + 1e-9);
        // and the aspect is the SOURCE's, which is the whole point.
        close(picture.width / picture.height, aspect);
      }
    });
  });

  describe('cover — today’s centre-crop, kept', () => {
    it('a WIDER source overflows horizontally and the HOLE stays at the box', () => {
      const { picture, visible } = fitPictureToBox(BOX, WIDE, 'cover');
      // 300 tall ⇒ 533.33 wide; the overflow hangs off both sides.
      expectRect(picture, { x: 100 - (1600 / 3 - 400) / 2, y: 200, width: 1600 / 3, height: 300 });
      // 🔴 `visible` is the BOX — punching the overflow would open the live layer
      // outside the box the author drew, which is B-149.
      expectRect(visible, BOX);
    });

    it('always covers the box on both axes, over a spread of aspects', () => {
      for (const aspect of [0.4, 0.9, 1, 1.5, WIDE, 2.39, 8]) {
        const { picture, visible } = fitPictureToBox(BOX, aspect, 'cover');
        expect(picture.width).toBeGreaterThanOrEqual(BOX.width - 1e-9);
        expect(picture.height).toBeGreaterThanOrEqual(BOX.height - 1e-9);
        expectRect(visible, BOX);
        close(picture.width / picture.height, aspect);
      }
    });
  });

  /**
   * 🔴 THE CONTESTED RULE, PINNED BY VALUE AT AN INPUT WHERE THE CANDIDATES DIVERGE.
   *
   * A test that passes under BOTH modes has tested nothing. These assertions are chosen
   * so `contain` and `cover` disagree on position AND on size, on both axes.
   */
  it('contain and cover DIVERGE on both position and size for one input', () => {
    const contain = fitPictureToBox(BOX, WIDE, 'contain');
    const cover = fitPictureToBox(BOX, WIDE, 'cover');
    expect(contain.picture.width).not.toBeCloseTo(cover.picture.width, 3);
    expect(contain.picture.height).not.toBeCloseTo(cover.picture.height, 3);
    expect(contain.picture.x).not.toBeCloseTo(cover.picture.x, 3);
    expect(contain.picture.y).not.toBeCloseTo(cover.picture.y, 3);
    // and the rects that reach air differ too — this is the on-air consequence.
    expect(contain.visible.height).not.toBeCloseTo(cover.visible.height, 3);
  });

  /**
   * 🔴 THE POSITIVE CONTROL — an aspect that MATCHES its box is byte-identical under
   * both modes, and identical to the box. C-028's regression bullet, and not optional.
   */
  it('a MATCHING aspect gives the box itself, identically in both modes', () => {
    const square: FitRect = { x: 10, y: 20, width: 300, height: 300 };
    for (const mode of ['contain', 'cover'] as const) {
      const { picture, visible } = fitPictureToBox(square, 1, mode);
      expectRect(picture, square);
      expectRect(visible, square);
    }
  });

  describe('no aspect ⇒ NO FIT in either mode (D-147, unchanged by C-028)', () => {
    it.each([null, 0, -1] as const)('%p fills the box exactly', (aspect) => {
      for (const mode of ['contain', 'cover'] as const) {
        const { picture, visible } = fitPictureToBox(BOX, aspect, mode);
        expectRect(picture, BOX);
        expectRect(visible, BOX);
      }
    });

    it('a degenerate box is answered, never divided by', () => {
      const flat: FitRect = { x: 0, y: 0, width: 100, height: 0 };
      const { picture } = fitPictureToBox(flat, WIDE, 'contain');
      expect(Number.isFinite(picture.width)).toBe(true);
      expectRect(picture, flat);
    });
  });

  /**
   * 🔴 **THE EQUIVARIANCE THAT LICENSES TWO CONSUMERS IN TWO SPACES** (design.md §0).
   *
   * The bridge fits in RASTER pixels; the page fits in SCENE pixels. They agree only
   * because scene → raster is `pad + s·(t + x)` with a SINGLE uniform `s`, under which
   * an aspect-preserving fit commutes. This asserts the commutation directly rather
   * than trusting the reading of `outputScale` — if it ever became a per-axis pair,
   * this is the test that fails, and it fails here rather than on air.
   */
  describe('fit ∘ map === map ∘ fit, for the real scene→raster transform', () => {
    const SCENE = { width: 960, height: 540 };
    const POSITION = { anchor: 'center', offset: { x: 0, y: 0 } } as const;

    const toRaster =
      (raster: Raster) =>
      (r: FitRect): FitRect => {
        const s = outputScale(raster);
        const pad = outputLetterbox(raster);
        const t = outputTranslate({ resolution: SCENE }, POSITION);
        return {
          x: pad.x + s * (t.x + r.x),
          y: pad.y + s * (t.y + r.y),
          width: s * r.width,
          height: s * r.height,
        };
      };

    // A NON-16:9 raster is the case that matters: on 16:9 `s = 1` and `pad = 0`, so
    // every term collapses to identity and a wrong implementation survives.
    const RASTERS: Raster[] = [
      { width: 1920, height: 1080 },
      { width: 720, height: 576 },
      { width: 1440, height: 1080 },
    ];

    it.each(RASTERS)('raster %o', (raster) => {
      const map = toRaster(raster);
      const boxInScene: FitRect = { x: 120, y: 60, width: 400, height: 300 };
      for (const mode of ['contain', 'cover'] as LiveFitMode[]) {
        for (const aspect of [WIDE, 4 / 3, 1 / 2]) {
          const fitThenMap = fitPictureToBox(boxInScene, aspect, mode);
          const mapThenFit = fitPictureToBox(map(boxInScene), aspect, mode);
          expectRect(map(fitThenMap.picture), mapThenFit.picture);
          expectRect(map(fitThenMap.visible), mapThenFit.visible);
        }
      }
    });
  });
});
