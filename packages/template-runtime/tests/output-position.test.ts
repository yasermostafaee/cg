import { afterEach, describe, expect, it } from 'vitest';
import type { Position, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import {
  applyOutputPosition,
  outputLetterbox,
  outputScale,
  parseChannelRasterQuery,
  resolveChannelRaster,
  resolveOutputPosition,
  REFERENCE_FRAME,
} from '../src/position.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * R-011 — output-only stage placement. `applyOutputPosition` is called ONLY
 * by the exported single-file boot (the page CasparCG loads); the Designer
 * preview path (`createRuntime` alone) must stay byte-for-byte unpositioned
 * — the author keeps seeing the comp at its own resolution.
 *
 * Effective position = URL-query override ?? scene.defaultPosition ??
 * centered (a fresh import never lands at 0,0). Formula with footprint
 * (fw,fh)=scene.resolution, reference frame 1920×1080, anchor fractions
 * ∈ {0,0.5,1}:
 *   stageX = ax*(ow−fw) + offset.x ;  stageY = ay*(oh−fh) + offset.y
 *
 * R-030 — every case in the first block DECLARES a 1920×1080 channel via
 * `view`, and that is the point of the declaration rather than a mechanical
 * requirement: these assertions are the no-regression contract. The anchor
 * maths is expressed in REFERENCE pixels and the channel raster is applied
 * afterwards as one uniform scale, so on a 1080 channel the scale is exactly 1
 * and every string below must remain byte-for-byte what it was before R-030.
 * Passing the raster explicitly stops the test inheriting jsdom's incidental
 * 1024×768 viewport — which is a real channel geometry as far as
 * `resolveChannelRaster` is concerned, and would silently scale the very output
 * these cases exist to pin.
 */
const CHANNEL_1080 = { innerWidth: 1920, innerHeight: 1080 };

/** A 300×300 comp (the "author small" case). */
function smallScene(defaultPosition?: Position): Scene {
  return {
    ...lowerThirdScene,
    id: 'scene-test-small',
    resolution: { width: 300, height: 300 },
    ...(defaultPosition !== undefined ? { defaultPosition } : {}),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.style.cssText = '';
  document.documentElement.style.cssText = '';
});

function stage(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.cg-stage');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('applyOutputPosition — the on-air boot placement (R-011)', () => {
  it('places the stage from an explicit query anchor+offset and sizes the page to the output frame', () => {
    createRuntime(smallScene(), { skipFontLoad: true });
    applyOutputPosition(smallScene(), {
      search: '?pos=bottom-right&dx=-10&dy=-20',
      view: CHANNEL_1080,
    });
    // ax=1 → 1*(1920−300)−10 = 1610 ; ay=1 → 1*(1080−300)−20 = 760
    expect(stage().style.transform).toBe('translate(1610px, 760px)');
    // The exported page's scene-sized overflow:hidden frame would clip a
    // translated stage — the output boot resizes the page to the output frame.
    expect(document.body.style.width).toBe('1920px');
    expect(document.body.style.height).toBe('1080px');
    expect(document.documentElement.style.width).toBe('1920px');
    expect(document.documentElement.style.height).toBe('1080px');
  });

  it('applies scene.defaultPosition when no override rides the URL', () => {
    const scene = smallScene({ anchor: 'mid-right', offset: { x: -40, y: 0 } });
    createRuntime(scene, { skipFontLoad: true });
    applyOutputPosition(scene, { search: '', view: CHANNEL_1080 });
    // ax=1 → 1620−40 = 1580 ; ay=0.5 → 390
    expect(stage().style.transform).toBe('translate(1580px, 390px)');
  });

  it('falls back to CENTERED — a fresh small comp never lands at 0,0', () => {
    createRuntime(smallScene(), { skipFontLoad: true });
    applyOutputPosition(smallScene(), { search: '', view: CHANNEL_1080 });
    // ax=ay=0.5 → (1620/2, 780/2)
    expect(stage().style.transform).toBe('translate(810px, 390px)');
  });

  it('ignores an invalid pos token WHOLESALE (falls through to the default chain)', () => {
    const scene = smallScene({ anchor: 'top-left', offset: { x: 5, y: 6 } });
    createRuntime(scene, { skipFontLoad: true });
    applyOutputPosition(scene, { search: '?pos=upper-middle&dx=999&dy=999', view: CHANNEL_1080 });
    // Invalid token → the manifest default, dx/dy of the bad override unused.
    expect(stage().style.transform).toBe('translate(5px, 6px)');
  });

  it('missing dx/dy default to 0; a full-frame scene computes translate(0px, 0px)', () => {
    const full: Scene = { ...lowerThirdScene, id: 'scene-test-full' };
    createRuntime(full, { skipFontLoad: true });
    applyOutputPosition(full, { search: '?pos=top-left', view: CHANNEL_1080 });
    expect(stage().style.transform).toBe('translate(0px, 0px)');
  });

  it('a 1080 channel emits NO scale and NO transform-origin — byte-identical to pre-R-030', () => {
    // The no-regression case, asserted on the DECLARATION and not merely on the
    // rendered result: a redundant `scale(1)` would render the same and would
    // still be a diff in the one output that must not change, and
    // `transform-origin` must not appear on a chain that has no scale in it.
    createRuntime(smallScene(), { skipFontLoad: true });
    applyOutputPosition(smallScene(), { search: '?cw=1920&ch=1080' });
    expect(stage().style.transform).toBe('translate(810px, 390px)');
    expect(stage().style.transform).not.toContain('scale');
    expect(stage().style.transformOrigin).toBe('');
    expect(document.body.style.width).toBe('1920px');
    expect(document.body.style.height).toBe('1080px');
  });
});

describe('R-030 — the channel raster and the one uniform scale', () => {
  it('parseChannelRasterQuery needs BOTH halves, finite and positive', () => {
    expect(parseChannelRasterQuery('?cw=1280&ch=720')).toEqual({ width: 1280, height: 720 });
    // Half a size is not a size — a lone axis invalidates the whole pair rather
    // than pairing itself with a guessed partner.
    expect(parseChannelRasterQuery('?cw=1280')).toBeNull();
    expect(parseChannelRasterQuery('?ch=720')).toBeNull();
    expect(parseChannelRasterQuery('?cw=abc&ch=720')).toBeNull();
    expect(parseChannelRasterQuery('?cw=0&ch=720')).toBeNull();
    expect(parseChannelRasterQuery('?cw=-1280&ch=720')).toBeNull();
    expect(parseChannelRasterQuery('')).toBeNull();
  });

  it('resolves geometry query → view → reference frame, in that order', () => {
    const view = { innerWidth: 1280, innerHeight: 720 };
    // 1. The query wins over the viewport, because it carries declared intent.
    expect(resolveChannelRaster('?cw=3840&ch=2160', view)).toEqual({ width: 3840, height: 2160 });
    // 2. No query → what CEF actually sized the page to.
    expect(resolveChannelRaster('', view)).toEqual({ width: 1280, height: 720 });
    // 3. Neither → the reference frame, i.e. today's behaviour at scale 1.
    expect(resolveChannelRaster('', null)).toEqual({ width: 1920, height: 1080 });
    // A view reporting nothing is NO SIGNAL, never a zero-sized channel: a
    // scale of 0 would blank the output, the worst reading of a missing measure.
    expect(resolveChannelRaster('', { innerWidth: 0, innerHeight: 0 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('outputScale is exactly 1 on the reference raster and uniform elsewhere', () => {
    expect(outputScale({ width: 1920, height: 1080 })).toBe(1);
    expect(outputScale({ width: 1280, height: 720 })).toBeCloseTo(2 / 3, 10);
    expect(outputScale({ width: 3840, height: 2160 })).toBe(2);
    // 4:3 — the smaller ratio wins, so the picture letterboxes instead of
    // stretching. min() is what makes the scale uniform.
    expect(outputScale({ width: 1440, height: 1080 })).toBe(0.75);
  });

  it('letterboxes a non-16:9 raster and pads a matching one by exactly nothing', () => {
    expect(outputLetterbox({ width: 1920, height: 1080 })).toEqual({ x: 0, y: 0 });
    expect(outputLetterbox({ width: 1280, height: 720 })).toEqual({ x: 0, y: 0 });
    // 1440×1080: scale 0.75 → 1440×810 of picture, 270 of bar split top/bottom.
    expect(outputLetterbox({ width: 1440, height: 1080 })).toEqual({ x: 0, y: 135 });
  });

  it('scales a 720p channel proportionally and sizes the page to the RASTER — no overflow', () => {
    // This is the C-018 defect: a 1920×1080 scene on the rebuilt 2.5.0 720p
    // channel overflowed and was worked around with `scrollTo(0, 360)`.
    const full: Scene = { ...lowerThirdScene, id: 'scene-test-full' };
    createRuntime(full, { skipFontLoad: true });
    applyOutputPosition(full, { search: '?pos=top-left&cw=1280&ch=720' });
    expect(stage().style.transform).toBe('translate(0px, 0px) scale(0.666667) translate(0px, 0px)');
    expect(stage().style.transformOrigin).toBe('0 0');
    // The page is the CHANNEL's size, so the scaled frame fits it exactly.
    // Sizing it to 1920×1080 here is what produced the overflow.
    expect(document.body.style.width).toBe('1280px');
    expect(document.body.style.height).toBe('720px');
    expect(document.documentElement.style.width).toBe('1280px');
    expect(document.documentElement.style.height).toBe('720px');
  });

  it('keeps the anchor maths in REFERENCE pixels — the scale is applied after it', () => {
    // A bottom-right small comp on a 720p channel: the anchor is still computed
    // against 1920×1080 (1610, 760 — identical to the 1080 case above) and the
    // scale then maps it onto the channel. That the reference numbers survive
    // untouched in the declaration IS the design: no coordinate rework.
    createRuntime(smallScene(), { skipFontLoad: true });
    applyOutputPosition(smallScene(), { search: '?pos=bottom-right&dx=-10&dy=-20&cw=1280&ch=720' });
    expect(stage().style.transform).toBe(
      'translate(0px, 0px) scale(0.666667) translate(1610px, 760px)',
    );
  });

  it('centres the picture on a 4:3 channel rather than distorting it', () => {
    const full: Scene = { ...lowerThirdScene, id: 'scene-test-full' };
    createRuntime(full, { skipFontLoad: true });
    applyOutputPosition(full, { search: '?pos=top-left&cw=1440&ch=1080' });
    expect(stage().style.transform).toBe('translate(0px, 135px) scale(0.75) translate(0px, 0px)');
    expect(document.body.style.width).toBe('1440px');
  });

  it('falls back to the page viewport when the bridge appended no geometry', () => {
    const full: Scene = { ...lowerThirdScene, id: 'scene-test-full' };
    createRuntime(full, { skipFontLoad: true });
    applyOutputPosition(full, {
      search: '?pos=top-left',
      view: { innerWidth: 1280, innerHeight: 720 },
    });
    expect(stage().style.transform).toBe('translate(0px, 0px) scale(0.666667) translate(0px, 0px)');
  });

  it('is idempotent — a second call cannot observe the first call’s page resize', () => {
    // The viewport fallback reads geometry that this function also writes to
    // (html/body). Resolving the raster BEFORE mutating is what makes a repeat
    // call land in the same place instead of compounding the scale.
    const full: Scene = { ...lowerThirdScene, id: 'scene-test-full' };
    createRuntime(full, { skipFontLoad: true });
    const opts = { search: '?pos=top-left', view: { innerWidth: 1280, innerHeight: 720 } };
    applyOutputPosition(full, opts);
    const first = stage().style.transform;
    applyOutputPosition(full, opts);
    expect(stage().style.transform).toBe(first);
    expect(document.body.style.width).toBe('1280px');
  });

  it('REFERENCE_FRAME stays 1920×1080 — scene coordinates never change meaning', () => {
    expect(REFERENCE_FRAME).toEqual({ width: 1920, height: 1080 });
  });

  it('resolveOutputPosition prefers the query over the manifest default', () => {
    const scene = smallScene({ anchor: 'top-left', offset: { x: 1, y: 2 } });
    expect(resolveOutputPosition(scene, '?pos=bottom-center&dx=3&dy=-4')).toEqual({
      anchor: 'bottom-center',
      offset: { x: 3, y: -4 },
    });
    expect(resolveOutputPosition(scene, '')).toEqual({
      anchor: 'top-left',
      offset: { x: 1, y: 2 },
    });
    expect(resolveOutputPosition(smallScene(), '')).toEqual({
      anchor: 'center',
      offset: { x: 0, y: 0 },
    });
  });
});

describe('Designer preview guard — createRuntime alone positions NOTHING', () => {
  it('leaves the stage untransformed and the page frame untouched', () => {
    createRuntime(smallScene({ anchor: 'bottom-right', offset: { x: -10, y: -10 } }), {
      skipFontLoad: true,
    });
    // Even with a manifest default present, the preview path (no
    // applyOutputPosition call) must not move the stage or resize the page —
    // the author sees the comp at its own resolution.
    expect(stage().style.transform).toBe('');
    expect(document.body.style.width).toBe('');
    expect(document.documentElement.style.width).toBe('');
  });
});
