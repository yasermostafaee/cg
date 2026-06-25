import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import {
  MAX_EXTENT_RATIO,
  fitZoom,
  offsetShiftScroll,
  pasteboardLayout,
  screenToScene,
  zoomAnchorScroll,
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
    // The frame inset is a CSS VARIABLE (so a content-grown offset updates live without a
    // reload); the baked margin (960×540) is the fallback so the FIRST paint is correct.
    expect(html).toContain('left: var(--cg-frame-x, 960px) !important');
    expect(html).toContain('top: var(--cg-frame-y, 540px) !important');
    // Two-tone by region: the surround (html/body) is the lighter #161927; the
    // frame-sized page backdrop (.cg-stage background-color) is a light gray
    // #c4c4ca, BEHIND the near-white checkerboard + shapes.
    expect(html).toContain('html, body { background: #161927 !important; }');
    expect(html).toContain('background-color: #c4c4ca');
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

  it('no content (or on-frame-only content) → the fixed 2× (back-compat)', () => {
    const base = { width: 3840, height: 2160, frame: { x: 960, y: 540 } };
    expect(pasteboardLayout({ width: 1920, height: 1080 })).toEqual(base);
    // A shape inside the frame does not move the result.
    expect(
      pasteboardLayout(
        { width: 1920, height: 1080 },
        { minX: 100, minY: 100, maxX: 400, maxY: 300 },
      ),
    ).toEqual(base);
  });
});

const RES = { width: 1920, height: 1080 }; // marginX=960, marginY=540 → 2× = 3840×2160

describe('pasteboardLayout — grows to fit off-frame content (Q1 = B: only past the 2× boundary)', () => {
  it('content WITHIN the 2× boundary is byte-identical to the fixed 2× (no growth)', () => {
    const base = pasteboardLayout(RES);
    // The 2× left boundary is scene x = −960; a shape down to −960 / right to 2880 stays in.
    expect(pasteboardLayout(RES, { minX: -960, minY: -540, maxX: 2880, maxY: 1620 })).toEqual(base);
    // A small off-frame shape (well within the margin) also doesn't grow.
    expect(pasteboardLayout(RES, { minX: -500, minY: -100, maxX: 1920, maxY: 1080 })).toEqual(base);
  });

  it('content PAST the left/up boundary grows with a FULL margin of headroom + shifts the offset', () => {
    // Off-left to x=−1500 (past −960): lo = −1500 − 960 = −2460 → offset.x = 2460;
    // hi stays 2880 → width = 2880 − (−2460) = 5340. Off-frame content lands at iframe ≥ 0.
    const l = pasteboardLayout(RES, { minX: -1500, minY: -540, maxX: 1920, maxY: 1080 });
    expect(l.frame.x).toBe(2460);
    expect(l.width).toBe(5340);
    expect(l.frame.x + -1500).toBeGreaterThanOrEqual(0); // content left at positive iframe x
    expect(l.frame.y).toBe(540); // y untouched (within bound)
  });

  it('content PAST the right/bottom boundary grows the extent but NOT the offset', () => {
    // Off-right to x=3500 (past 2880): hi = 3500 + 960 = 4460 → width = 4460 − (−960) = 5420;
    // offset.x stays 960 (no left growth).
    const r = pasteboardLayout(RES, { minX: 0, minY: 0, maxX: 3500, maxY: 2600 });
    expect(r.frame.x).toBe(960);
    expect(r.width).toBe(5420);
    expect(r.frame.y).toBe(540);
    expect(r.height).toBe(2600 + 540 - -540); // 3680
  });

  it('clamps growth so the extent never exceeds MAX_EXTENT_RATIO× the frame', () => {
    // Absurd far-right coordinate: the right side is clamped (each side caps at 5.5×
    // growth), so the extent is bounded — not millions of px.
    const far = pasteboardLayout(RES, { minX: 0, minY: 0, maxX: 10_000_000, maxY: 1080 });
    expect(far.width).toBeLessThanOrEqual(MAX_EXTENT_RATIO * RES.width);
    expect(far.width).toBeLessThan(20_000); // clamped, not 10M
    // Far on BOTH sides → exactly the 12× cap (each side clamped to its 5.5× growth).
    const both = pasteboardLayout(RES, {
      minX: -10_000_000,
      minY: 0,
      maxX: 10_000_000,
      maxY: 1080,
    });
    expect(both.width).toBe(MAX_EXTENT_RATIO * RES.width); // 23040
  });

  it('NEVER shrinks below the 2× floor as far content returns inward', () => {
    const base = pasteboardLayout(RES);
    // Content returned to inside the boundary → back to exactly 2× (not smaller).
    expect(pasteboardLayout(RES, { minX: -200, minY: -200, maxX: 2000, maxY: 1200 })).toEqual(base);
  });
});

describe('offsetShiftScroll — origin-shift scroll compensation holds content stationary', () => {
  it('scrolls by Δoffset × zoom so a shifted origin keeps the visible content put', () => {
    // Offset grew by 300 scene px (content extended left) at zoom 0.5 → scroll += 150.
    expect(offsetShiftScroll(40, 300, 0.5)).toBe(40 + 300 * 0.5);
    // Offset shrank by 300 (content returned) → scroll −= 150 (symmetric).
    expect(offsetShiftScroll(190, -300, 0.5)).toBe(190 - 150);
    expect(offsetShiftScroll(40, 0, 0.5)).toBe(40); // no shift → no scroll
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

describe('zoomAnchorScroll — cursor-anchored zoom keeps the point fixed (no jump)', () => {
  it('preserves the scene point under the cursor across a zoom delta', () => {
    // Pre-zoom: stage origin at screen 100, zoom 0.5, scroll 40; cursor at client 300.
    const stageBefore = 100;
    const oldZoom = 0.5;
    const scrollBefore = 40;
    const client = 300;
    const scenePoint = (client - stageBefore) / oldZoom; // the scene coord under the cursor
    // Zoom to 1.0; after relayout the stage origin (pre-correction) is at screen 80.
    const newZoom = 1.0;
    const stageAfter = 80;
    const newScroll = zoomAnchorScroll(scrollBefore, stageAfter, scenePoint, newZoom, client);
    // Applying the new scroll shifts the stage origin by −(newScroll − scrollBefore); the
    // scene point must then sit back EXACTLY under the cursor (no jump).
    const stageOriginCorrected = stageAfter - (newScroll - scrollBefore);
    expect(stageOriginCorrected + scenePoint * newZoom).toBeCloseTo(client, 6);
  });

  it('is a no-op when the zoom does not change (same scroll back)', () => {
    // newZoom == oldZoom and the stage origin unchanged ⇒ scroll is unchanged.
    const scenePoint = (300 - 100) / 0.5;
    expect(zoomAnchorScroll(40, 100, scenePoint, 0.5, 300)).toBeCloseTo(40, 6);
  });
});
