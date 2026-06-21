import { beforeAll, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import {
  fitZoom,
  pasteboardExtent,
  screenToScene,
} from '../src/renderer/features/canvas/geometry.js';

/**
 * D-071 Phase B — the editor pasteboard. The `#buildHtml` `authoring` flag lifts the
 * `.cg-stage { overflow: hidden }` clip so off-frame shapes paint beyond the frame —
 * for the CANVAS iframe ONLY, INDEPENDENT of D-087's `broadcast`. The broadcast modal
 * + exports keep the native clip (UNCHANGED). The canvas STAGE extent (= the frame
 * for an empty doc; grown only by off-frame content) drives the centered-fit layout.
 * The visible centering / ruler / guides are pinned by the E2E `pasteboard.spec.ts`.
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-d071b',
  name: 'pasteboard',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [],
  compositions: [],
} as unknown as Scene;

const CLIP_LIFT = 'overflow: visible !important';

describe('D-071 Phase B — pasteboard authoring document', () => {
  let preview: Preview;

  beforeAll(() => {
    urlGlobals.createObjectURL = () => 'blob:stub';
    urlGlobals.revokeObjectURL = () => undefined;
    preview = new Preview({ cgJs: 'export const noop = 1;', cgCss: '.cg-stage{}', fontsCss: '' });
  });

  it('authoring:true lifts the .cg-stage clip; the viewport is device-width (size set by the canvas)', () => {
    const { html } = preview.load(SCENE, false, true);
    expect(html).toContain(CLIP_LIFT); // the clip is lifted so off-frame paints
    expect(html).toContain('width: 1920px !important'); // the frame keeps its size (top-left)
    expect(html).toContain('#161927'); // dark pasteboard margin
    // device-width lets the iframe's (changing) element size drive the layout, no stretch.
    expect(html).toContain('width=device-width');
  });

  it('authoring:false (the default) keeps the .cg-stage clip — no pasteboard', () => {
    const { html } = preview.load(SCENE);
    expect(html).not.toContain(CLIP_LIFT);
  });

  it('the broadcast modal (broadcast:true, authoring:false) keeps the clip — UNCHANGED', () => {
    const { html } = preview.load(SCENE, true, false);
    expect(html).not.toContain(CLIP_LIFT);
  });
});

function shape(id: string, x: number, y: number, w = 100, h = 100): Element {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    transform: {
      position: { x, y },
      size: { w, h },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function doc(children: Element[]): {
  layers: { children: Element[] }[];
  resolution: { width: number; height: number };
} {
  return { layers: [{ children }], resolution: { width: 1920, height: 1080 } };
}

describe('pasteboardExtent', () => {
  it('an empty / on-frame doc returns the FRAME (so the stage centers + fits as before)', () => {
    expect(pasteboardExtent(doc([]))).toEqual({ width: 1920, height: 1080 });
    expect(pasteboardExtent(doc([shape('on', 100, 100)]))).toEqual({ width: 1920, height: 1080 });
  });

  it('off-frame content grows the extent right/bottom (frame + content + margin)', () => {
    // A shape parked off the right edge: right = 2000 + 100 = 2100 (> 1920) → +80 margin.
    expect(pasteboardExtent(doc([shape('off', 2000, 100)]))).toEqual({ width: 2180, height: 1080 });
    expect(pasteboardExtent(doc([shape('below', 100, 1200)]))).toEqual({
      width: 1920,
      height: 1380,
    });
  });
});

describe('fitZoom — fits the FRAME bounds (not the pasteboard extent)', () => {
  it('scales the frame to fit the viewport minus the margin', () => {
    // 1920×1080 frame in an 800×600 viewport (margin 16): limited by width →
    // (800 - 16) / 1920. (Computed from the FRAME, never the pasteboard extent.)
    expect(fitZoom(800, 600, 1920, 1080, 16)).toBeCloseTo((800 - 16) / 1920, 5);
  });
});

describe('ruler / canvas coord→pixel mapping (scroll + zoom aware)', () => {
  // The ruler (and guides) place scene (0,0) at `origin` (the frame top-left, which
  // tracks scroll) and map scene→pixel as `origin + scene*zoom` — i.e. the inverse,
  // `screenToScene`, takes a pixel back to scene. Frame top-left → 0; centre → W/2.
  it('frame top-left → scene 0; frame centre → W/2, at a scrolled origin and a zoom', () => {
    const origin = 250; // the frame's top-left screen px (e.g. after some scroll)
    const zoom = 0.4;
    const W = 1920;
    const rect = { left: origin, top: 0 };
    expect(screenToScene(origin, 0, rect, zoom).x).toBe(0);
    expect(screenToScene(origin + (W / 2) * zoom, 0, rect, zoom).x).toBeCloseTo(W / 2, 5);
  });
});
