import { afterEach, describe, expect, it } from 'vitest';
import type { Position, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { applyOutputPosition, resolveOutputPosition } from '../src/position.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * R-011 — output-only stage placement. `applyOutputPosition` is called ONLY
 * by the exported single-file boot (the page CasparCG loads); the Designer
 * preview path (`createRuntime` alone) must stay byte-for-byte unpositioned
 * — the author keeps seeing the comp at its own resolution.
 *
 * Effective position = URL-query override ?? scene.defaultPosition ??
 * centered (a fresh import never lands at 0,0). Formula with footprint
 * (fw,fh)=scene.resolution, output 1920×1080, anchor fractions ∈ {0,0.5,1}:
 *   stageX = ax*(ow−fw) + offset.x ;  stageY = ay*(oh−fh) + offset.y
 */

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
    applyOutputPosition(smallScene(), { search: '?pos=bottom-right&dx=-10&dy=-20' });
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
    applyOutputPosition(scene, { search: '' });
    // ax=1 → 1620−40 = 1580 ; ay=0.5 → 390
    expect(stage().style.transform).toBe('translate(1580px, 390px)');
  });

  it('falls back to CENTERED — a fresh small comp never lands at 0,0', () => {
    createRuntime(smallScene(), { skipFontLoad: true });
    applyOutputPosition(smallScene(), { search: '' });
    // ax=ay=0.5 → (1620/2, 780/2)
    expect(stage().style.transform).toBe('translate(810px, 390px)');
  });

  it('ignores an invalid pos token WHOLESALE (falls through to the default chain)', () => {
    const scene = smallScene({ anchor: 'top-left', offset: { x: 5, y: 6 } });
    createRuntime(scene, { skipFontLoad: true });
    applyOutputPosition(scene, { search: '?pos=upper-middle&dx=999&dy=999' });
    // Invalid token → the manifest default, dx/dy of the bad override unused.
    expect(stage().style.transform).toBe('translate(5px, 6px)');
  });

  it('missing dx/dy default to 0; a full-frame scene computes translate(0px, 0px)', () => {
    const full: Scene = { ...lowerThirdScene, id: 'scene-test-full' };
    createRuntime(full, { skipFontLoad: true });
    applyOutputPosition(full, { search: '?pos=top-left' });
    expect(stage().style.transform).toBe('translate(0px, 0px)');
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
