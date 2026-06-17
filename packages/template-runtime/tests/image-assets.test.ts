import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-062 — the runtime's `assetUrls` seam: after building the scene, the runtime
 * sets the `src` of each `<img data-cg-asset-id>` from a host-supplied map. The
 * exporters bake this map (packaged relative paths / base64 data URIs); the
 * Designer preview passes no map and wires `src` itself (parity).
 */

function imageScene(assetId: string): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-img',
    name: 'img',
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
        children: [
          {
            id: 'logo',
            name: 'logo',
            type: 'image',
            assetId,
            fit: 'contain',
            preserveAspect: true,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            transform: {
              position: { x: 0, y: 0 },
              size: { w: 200, h: 100 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

const imgSrc = (assetId: string): string | null =>
  document.querySelector(`img[data-cg-asset-id="${assetId}"]`)?.getAttribute('src') ?? null;

describe('createRuntime — D-062 image assetUrls seam', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('sets the <img> src from a supplied assetUrls map', () => {
    createRuntime(imageScene('a1'), {
      assetUrls: { a1: 'assets/image/abc.png' },
      skipFontLoad: true,
      installGlobals: false,
    });
    expect(imgSrc('a1')).toBe('assets/image/abc.png');
  });

  it('inlines a data: URI src verbatim (single-file HTML path)', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    createRuntime(imageScene('a1'), {
      assetUrls: { a1: dataUri },
      skipFontLoad: true,
      installGlobals: false,
    });
    expect(imgSrc('a1')).toBe(dataUri);
  });

  it('leaves the <img> src unset when no map is supplied (preview parity)', () => {
    createRuntime(imageScene('a1'), { skipFontLoad: true, installGlobals: false });
    expect(imgSrc('a1')).toBeNull();
  });

  it('leaves the src unset when the map has no entry for the asset', () => {
    createRuntime(imageScene('a1'), {
      assetUrls: { other: 'assets/image/zzz.png' },
      skipFontLoad: true,
      installGlobals: false,
    });
    expect(imgSrc('a1')).toBeNull();
  });
});
