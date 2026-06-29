import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import {
  PASTEBOARD_MARGIN_X,
  PASTEBOARD_MARGIN_Y,
  fitZoom,
  pasteboardLayout,
  screenToScene,
  zoomAnchorScroll,
} from '../src/renderer/features/canvas/geometry.js';

/**
 * The editor pasteboard. The `#buildHtml` `authoring` flag lifts the
 * `.cg-stage { overflow: hidden }` clip so off-frame shapes paint beyond the frame, and
 * `frameOffset` insets the frame into a FIXED, SYMMETRIC pasteboard (margin on every
 * side) — for the CANVAS iframe ONLY. The broadcast modal + exports keep the native clip
 * (UNCHANGED). B-027: `pasteboardLayout` is a pure function of the RESOLUTION (no
 * content-grow), so the dark area + the frame offset never change on a drag — the frame
 * cannot drift. The visible centering / ruler / guides / off-frame visibility are pinned
 * by the E2E specs.
 */

const urlGlobals = URL as unknown as {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
};

const SCENE: Scene = {
  schemaVersion: 1,
  id: 's-pb',
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

describe('pasteboard authoring document', () => {
  let preview: Preview;

  beforeAll(() => {
    urlGlobals.createObjectURL = () => 'blob:stub';
    urlGlobals.revokeObjectURL = () => undefined;
    preview = new Preview({ cgJs: 'export const noop = 1;', cgCss: '.cg-stage{}', fontsCss: '' });
  });

  it('authoring:true lifts the .cg-stage clip + insets the frame into the fixed pasteboard; device-width', () => {
    const { frame } = pasteboardLayout(SCENE.resolution);
    const { html } = preview.load(SCENE, false, true, frame);
    expect(html).toContain(CLIP_LIFT); // the clip is lifted so off-frame paints
    // B-028 — the frame SIZE is a CSS variable (so a scene-size change resizes the page
    // live on the no-reload scene-replace path); the baked resolution is the fallback.
    expect(html).toContain('width: var(--cg-frame-w, 1920px) !important');
    expect(html).toContain('height: var(--cg-frame-h, 1080px) !important');
    // B-027 — the frame inset is the CONSTANT fixed-pasteboard margin (3×1920 / 2×1080 =
    // 5760 / 2160), baked as the CSS-var fallback so the first paint is correct.
    expect(html).toContain('left: var(--cg-frame-x, 5760px) !important');
    expect(html).toContain('top: var(--cg-frame-y, 2160px) !important');
    expect(html).toContain('applyFrameSize({ width: 1920, height: 1080 })');
    expect(html).toContain('html, body { background: #161927 !important; }');
    expect(html).toContain('background-color: #3d4253');
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

describe('B-027 — pasteboardLayout is a FIXED extent (pure function of the resolution)', () => {
  it('total = 7× width × 5× height; frame inset = 3× width / 2× height', () => {
    // margins: 3× the frame width left+right, 2× the frame height top+bottom.
    expect(pasteboardLayout({ width: 1920, height: 1080 })).toEqual({
      width: 1920 * 7,
      height: 1080 * 5,
      frame: { x: 1920 * 3, y: 1080 * 2 },
    });
    expect(pasteboardLayout({ width: 1280, height: 720 })).toEqual({
      width: 1280 * 7,
      height: 720 * 5,
      frame: { x: 1280 * 3, y: 720 * 2 },
    });
  });

  it('uses the documented margin constants (3 / 2)', () => {
    expect(PASTEBOARD_MARGIN_X).toBe(3);
    expect(PASTEBOARD_MARGIN_Y).toBe(2);
    const r = { width: 1920, height: 1080 };
    const l = pasteboardLayout(r);
    expect(l.frame.x).toBe(r.width * PASTEBOARD_MARGIN_X);
    expect(l.frame.y).toBe(r.height * PASTEBOARD_MARGIN_Y);
    expect(l.width).toBe(r.width * (1 + 2 * PASTEBOARD_MARGIN_X));
    expect(l.height).toBe(r.height * (1 + 2 * PASTEBOARD_MARGIN_Y));
  });

  it('is content-INDEPENDENT: it depends only on the resolution (calling it twice is identical)', () => {
    // The grow-to-fit `content` argument is gone — the same resolution always yields the
    // same extent, so dragging a shape off-frame can never change it (no drift).
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
  it('frame top-left → scene 0; frame centre → W/2, at a scrolled origin and a zoom', () => {
    const origin = 250; // the frame's top-left screen px (e.g. after some scroll)
    const zoom = 0.4;
    const W = 1920;
    const rect = { left: origin, top: 0 };
    expect(screenToScene(origin, 0, rect, zoom).x).toBe(0);
    expect(screenToScene(origin + (W / 2) * zoom, 0, rect, zoom).x).toBeCloseTo(W / 2, 5);
  });
});

describe('zoomAnchorScroll — cursor-anchored zoom keeps the point fixed (no jump)', () => {
  it('preserves the scene point under the cursor across a zoom delta', () => {
    const stageBefore = 100;
    const oldZoom = 0.5;
    const scrollBefore = 40;
    const client = 300;
    const scenePoint = (client - stageBefore) / oldZoom;
    const newZoom = 1.0;
    const stageAfter = 80;
    const newScroll = zoomAnchorScroll(scrollBefore, stageAfter, scenePoint, newZoom, client);
    const stageOriginCorrected = stageAfter - (newScroll - scrollBefore);
    expect(stageOriginCorrected + scenePoint * newZoom).toBeCloseTo(client, 6);
  });

  it('is a no-op when the zoom does not change (same scroll back)', () => {
    const scenePoint = (300 - 100) / 0.5;
    expect(zoomAnchorScroll(40, 100, scenePoint, 0.5, 300)).toBeCloseTo(40, 6);
  });
});
