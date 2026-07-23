import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { Scene, VideoElement } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-128 Phase 3 — the canvas render for a `video` element: a real `<video>` at
 * its MID-CLIP poster frame, positioned by the element transform. The `src` is
 * left unset (the host wires `data-cg-asset-id` → blob URL, exactly like an
 * `<img>`); the host also seeks to `data-cg-poster-ms`. Playback lifecycle is
 * Phase 4 — here the element is a muted, positioned box.
 */

function videoScene(over: Partial<VideoElement> = {}): Scene {
  const el: VideoElement = {
    id: 'v1',
    name: 'Clip',
    type: 'video',
    assetId: 'clip1',
    durationMs: 40_000,
    holdBehavior: 'loop',
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    transform: {
      position: { x: 30, y: 40 },
      size: { w: 1920, h: 282 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    ...over,
  };
  return {
    schemaVersion: 1,
    id: 'scene-v',
    name: 'v',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [el],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

const video = (): HTMLVideoElement | null =>
  document.querySelector<HTMLVideoElement>('video[data-cg-asset-id="clip1"]');

describe('createRuntime — D-128 Phase 3 video render', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('renders a positioned <video> carrying the asset id and mid-clip poster time', () => {
    createRuntime(videoScene(), { skipFontLoad: true, installGlobals: false });
    const v = video();
    expect(v).not.toBeNull();
    expect(v!.dataset['cgPosterMs']).toBe('20000'); // midpoint of 40 000 ms
    // element transform is applied via the shared applyBaseStyles (same as <img>)
    expect(v!.style.left).toBe('30px');
    expect(v!.style.top).toBe('40px');
    expect(v!.style.width).toBe('1920px');
    expect(v!.style.height).toBe('282px');
    // muted + inert; the src is wired by the host (like <img>), not here
    expect(v!.muted).toBe(true);
    expect(v!.hasAttribute('playsinline')).toBe(true);
    expect(v!.getAttribute('src')).toBeNull();
  });

  it('uses the In-point (introEnd) as the poster time when phases are marked', () => {
    createRuntime(videoScene({ phases: { introEnd: 8000, outroStart: 30_000 } }), {
      skipFontLoad: true,
      installGlobals: false,
    });
    expect(video()!.dataset['cgPosterMs']).toBe('8000');
  });

  it('a hidden video element is display:none (visibility parity with other kinds)', () => {
    createRuntime(videoScene({ visible: false }), { skipFontLoad: true, installGlobals: false });
    expect(video()!.style.display).toBe('none');
  });
});
