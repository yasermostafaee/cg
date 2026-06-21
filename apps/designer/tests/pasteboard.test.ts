import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import {
  fitZoom,
  pasteboardLayout,
  screenToScene,
} from '../src/renderer/features/canvas/geometry.js';

/**
 * D-071 Phase B — the editor pasteboard. The `#buildHtml` `authoring` flag lifts the
 * `.cg-stage { overflow: hidden }` clip so off-frame shapes paint beyond the frame, and
 * `frameOffset` insets the frame into a FIXED, SYMMETRIC pasteboard (margin on every
 * side) so off-frame content shows on all sides — for the CANVAS iframe ONLY,
 * INDEPENDENT of D-087's `broadcast`. The broadcast modal + exports keep the native
 * clip (UNCHANGED). `pasteboardLayout` is a pure function of the resolution, so the dark
 * area never resizes on drag (only zoom scales it). The visible centering / ruler /
 * guides / off-frame visibility are pinned by the E2E `pasteboard.spec.ts`.
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

  it('authoring:true lifts the .cg-stage clip + insets the frame into the symmetric pasteboard; device-width', () => {
    const { frame } = pasteboardLayout(SCENE.resolution);
    const { html } = preview.load(SCENE, false, true, frame);
    expect(html).toContain(CLIP_LIFT); // the clip is lifted so off-frame paints
    expect(html).toContain('width: 1920px !important'); // the frame keeps its size
    // The frame is inset by the pasteboard margin (960×540), so off-frame content is
    // visible on EVERY side — not pinned to the iframe origin.
    expect(html).toContain('left: 960px !important');
    expect(html).toContain('top: 540px !important');
    expect(html).toContain('#161927'); // dark pasteboard margin
    // device-width lets the iframe's element size drive the layout, no stretch.
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

describe('pasteboardLayout — fixed, symmetric pasteboard (resolution-driven)', () => {
  it('extends a margin on ALL sides; the frame is inset + centered (off-frame shows on every side)', () => {
    // 1920×1080 → 50% margin each side: 960×540 → stage 3840×2160, frame inset at (960,540).
    expect(pasteboardLayout({ width: 1920, height: 1080 })).toEqual({
      width: 3840,
      height: 2160,
      frame: { x: 960, y: 540 },
    });
    expect(pasteboardLayout({ width: 1280, height: 720 })).toEqual({
      width: 2560,
      height: 1440,
      frame: { x: 640, y: 360 },
    });
  });

  it('is a pure function of the RESOLUTION — element positions never enter it (no drag-resize)', () => {
    // The signature takes only the resolution: there is NO doc/element argument, so a
    // shape dragged off-frame cannot change the stage size (only zoom scales it).
    const a = pasteboardLayout({ width: 1920, height: 1080 });
    const b = pasteboardLayout({ width: 1920, height: 1080 });
    expect(a).toEqual(b);
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
