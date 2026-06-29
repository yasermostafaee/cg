import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import {
  PASTEBOARD_MARGIN_X,
  PASTEBOARD_MARGIN_Y,
  clampDeltaToPasteboard,
  coverZoom,
  fitZoom,
  pasteboardLayout,
  pasteboardSceneBounds,
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
    // B-027 — the frame inset is the CONSTANT fixed-pasteboard margin (1×1920 / 1×1080 =
    // 1920 / 1080), baked as the CSS-var fallback so the first paint is correct.
    expect(html).toContain('left: var(--cg-frame-x, 1920px) !important');
    expect(html).toContain('top: var(--cg-frame-y, 1080px) !important');
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
  it('total = 3× width × 3× height; frame inset = 1× width / 1× height', () => {
    // margins: a one-frame margin on every side (1× width left+right, 1× height top+bottom).
    expect(pasteboardLayout({ width: 1920, height: 1080 })).toEqual({
      width: 1920 * 3,
      height: 1080 * 3,
      frame: { x: 1920, y: 1080 },
    });
    expect(pasteboardLayout({ width: 1280, height: 720 })).toEqual({
      width: 1280 * 3,
      height: 720 * 3,
      frame: { x: 1280, y: 720 },
    });
  });

  it('uses the documented margin constants (1 / 1)', () => {
    expect(PASTEBOARD_MARGIN_X).toBe(1);
    expect(PASTEBOARD_MARGIN_Y).toBe(1);
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

  it('pasteboardSceneBounds spans [−margin, frame + margin] in scene coords', () => {
    // scene (0,0) = frame top-left; the 1× margin extends to −W left / 2W right (= W frame
    // + W right margin), symmetrically on Y.
    expect(pasteboardSceneBounds({ width: 1920, height: 1080 })).toEqual({
      minX: -1920,
      minY: -1080,
      maxX: 1920 * 2,
      maxY: 1080 * 2,
    });
  });
});

describe('B-027 — clampDeltaToPasteboard keeps a box inside the pasteboard (no dead zone)', () => {
  // A 1920×1080 frame → bounds x ∈ [−1920, 3840], y ∈ [−1080, 2160].
  const { minX, maxX } = pasteboardSceneBounds({ width: 1920, height: 1080 });

  it('passes a delta through untouched while the whole box stays inside', () => {
    // box [0, 100] moved by +200 → [200, 300] ⊆ [−1920, 3840]; unclamped.
    expect(clampDeltaToPasteboard(200, 0, 100, minX, maxX)).toBe(200);
  });

  it('clamps so the box edge stops AT the bound, never crossing (right + left)', () => {
    // box [3700, 3800], want +500 → would be [4200, 4300] past maxX 3840; allowed delta
    // is maxX − boxMax = 3840 − 3800 = 40, so the right edge touches the bound.
    expect(clampDeltaToPasteboard(500, 3700, 3800, minX, maxX)).toBe(40);
    // box [−1800, −1700] wanting −500 → past minX −1920; allowed is minX − boxMin = −120.
    expect(clampDeltaToPasteboard(-500, -1800, -1700, minX, maxX)).toBe(-120);
  });

  it('pre-existing-outside: never pushes further out, lets it move back in', () => {
    // box already LEFT-outside: [−2200, −2100] (boxMin < minX). A further-left delta is
    // refused (clamped to 0 — don't push out), but an inward (+) delta is allowed.
    expect(clampDeltaToPasteboard(-300, -2200, -2100, minX, maxX)).toBe(0);
    expect(clampDeltaToPasteboard(300, -2200, -2100, minX, maxX)).toBe(300);
  });

  it('oversized on an axis: centers the box (it cannot fit), ignoring the requested delta', () => {
    // box wider than the pasteboard span (3840 − (−1920) = 5760): width 6000, box [0, 6000].
    // Centered: center delta = (minX+maxX)/2 − (boxMin+boxMax)/2 = 960 − 3000 = −2040.
    const d = clampDeltaToPasteboard(999, 0, 6000, minX, maxX);
    expect(d).toBe((minX + maxX) / 2 - (0 + 6000) / 2);
    // After applying, the box center sits at the pasteboard center.
    expect((0 + d + (6000 + d)) / 2).toBe((minX + maxX) / 2);
  });
});

describe('B-027 — coverZoom is the cover-fit minimum (pasteboard always covers the viewport)', () => {
  // The 1920×1080 pasteboard extent is 5760 × 3240.
  const E = pasteboardLayout({ width: 1920, height: 1080 });

  it('is the MAX of the two axis ratios (cover, not contain)', () => {
    // A WIDE viewport: width ratio dominates.
    expect(coverZoom(1000, 500, E.width, E.height)).toBeCloseTo(
      Math.max(1000 / E.width, 500 / E.height),
      6,
    );
    expect(coverZoom(1000, 500, E.width, E.height)).toBe(1000 / E.width); // 1000/5760 > 500/3240
    // A TALL viewport: height ratio dominates.
    expect(coverZoom(500, 1000, E.width, E.height)).toBe(1000 / E.height); // 1000/3240 > 500/5760
  });

  it('at the cover-fit zoom the pasteboard covers the viewport on BOTH axes (no gap)', () => {
    for (const [vw, vh] of [
      [1000, 500],
      [500, 1000],
      [1280, 720],
      [800, 800],
    ] as const) {
      const z = coverZoom(vw, vh, E.width, E.height);
      // scaled extent ≥ viewport on each axis → no empty surround on either side.
      expect(E.width * z).toBeGreaterThanOrEqual(vw - 1e-6);
      expect(E.height * z).toBeGreaterThanOrEqual(vh - 1e-6);
      // …and one axis fits EXACTLY (the max-ratio axis), so it is the SMALLEST covering zoom.
      const exact = Math.min(E.width * z - vw, E.height * z - vh);
      expect(exact).toBeCloseTo(0, 6);
    }
  });

  it('returns 0 for a degenerate (unmeasured) viewport or extent', () => {
    expect(coverZoom(0, 500, E.width, E.height)).toBe(0);
    expect(coverZoom(1000, 500, 0, E.height)).toBe(0);
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
