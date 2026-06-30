import { beforeAll, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { Preview } from '../src/platform/preview.js';
import {
  COVER_OVERSHOOT_PX,
  PASTEBOARD_MIN_X,
  PASTEBOARD_MIN_Y,
  PIXEL_GRID_MAJOR_EVERY,
  PIXEL_GRID_MIN_ZOOM,
  clampDeltaToPasteboard,
  coverZoom,
  fitZoom,
  pasteboardLayout,
  pasteboardSceneBounds,
  pixelGridLines,
  pixelGridVisible,
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
    // B-027 — the frame inset is the CONSTANT pasteboard margin = max(5000, 1920) /
    // max(3000, 1080) = 5000 / 3000, baked as the CSS-var fallback so the first paint is right.
    expect(html).toContain('left: var(--cg-frame-x, 5000px) !important');
    expect(html).toContain('top: var(--cg-frame-y, 3000px) !important');
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

describe('B-027 — pasteboardLayout is a FIXED extent (margin = max(absolute-min, one-frame) per side)', () => {
  it('margin per side = max(5000, W) X / max(3000, H) Y; extent = frame + 2·margin; inset = margin', () => {
    // Worked examples (locked with the owner). marginX = max(5000, W), marginY = max(3000, H);
    // extent = frame + 2·margin per axis; frame inset = (marginX, marginY). The absolute floor
    // keeps a TINY frame's pasteboard large — a 1× multiplier alone made 100×100 a 300×300
    // pasteboard, so the cover-fit min-zoom shot to ~428% and froze zoom.
    const cases: [number, number, number, number, number, number][] = [
      // [W, H, marginX, marginY, extentW, extentH]
      [100, 100, 5000, 3000, 10100, 6100], // tiny — the previously-broken zoom-lock case
      [1280, 720, 5000, 3000, 11280, 6720],
      [1920, 1080, 5000, 3000, 11920, 7080],
      [1080, 1920, 5000, 3000, 11080, 7920], // vertical
      [5000, 3000, 5000, 3000, 15000, 9000], // BOUNDARY: the min EQUALS one frame
      [8000, 3000, 8000, 3000, 24000, 9000], // EXCEED: one frame > the X min → one-frame margin
    ];
    for (const [width, height, mx, my, ew, eh] of cases) {
      expect(pasteboardLayout({ width, height })).toEqual({
        width: ew,
        height: eh,
        frame: { x: mx, y: my },
      });
    }
  });

  it('uses the documented absolute-minimum constants (5000 / 3000)', () => {
    expect(PASTEBOARD_MIN_X).toBe(5000);
    expect(PASTEBOARD_MIN_Y).toBe(3000);
    // Below the floor the margin IS the floor (a sub-floor frame, e.g. 1920×1080); at/above it
    // the margin is the frame itself (e.g. 8000 on X).
    expect(pasteboardLayout({ width: 1920, height: 1080 }).frame).toEqual({ x: 5000, y: 3000 });
    expect(pasteboardLayout({ width: 8000, height: 3000 }).frame).toEqual({ x: 8000, y: 3000 });
  });

  it('is content-INDEPENDENT: it depends only on the resolution (calling it twice is identical)', () => {
    // The grow-to-fit `content` argument is gone — the same resolution always yields the
    // same extent, so dragging a shape off-frame can never change it (no drift).
    const a = pasteboardLayout({ width: 1920, height: 1080 });
    const b = pasteboardLayout({ width: 1920, height: 1080 });
    expect(a).toEqual(b);
  });

  it('pasteboardSceneBounds spans [−margin, frame + margin] in scene coords', () => {
    // scene (0,0) = frame top-left; for 1920×1080 (both axes below the floor → margin = floor)
    // the bounds extend to −5000 left / 1920+5000 = 6920 right, −3000 top / 1080+3000 = 4080.
    expect(pasteboardSceneBounds({ width: 1920, height: 1080 })).toEqual({
      minX: -5000,
      minY: -3000,
      maxX: 6920,
      maxY: 4080,
    });
  });

  it('a TINY 100×100 frame yields a SMALL cover-fit min-zoom — the zoom-lock fix (not ~428%)', () => {
    const E = pasteboardLayout({ width: 100, height: 100 });
    expect(E).toEqual({ width: 10100, height: 6100, frame: { x: 5000, y: 3000 } });
    // With the always-large pasteboard the cover-fit over a typical editor viewport is a small
    // fraction, so zoom-out works across a useful range (well under 100%).
    const z = coverZoom(1920, 1080, E.width, E.height); // MAX(1920/10100, 1080/6100) ≈ 0.19
    expect(z).toBeLessThan(0.2);
    expect(z).toBeGreaterThan(0);
    // Contrast: the OLD 1×-margin pasteboard for 100×100 was only 300×300, so the cover-fit
    // shot ABOVE ZOOM_MAX (4) — pinning the minimum and freezing zoom (the reported bug).
    expect(coverZoom(1920, 1080, 300, 300)).toBeGreaterThan(4);
  });
});

describe('B-027 — clampDeltaToPasteboard keeps a box inside the pasteboard (no dead zone)', () => {
  // A 1920×1080 frame → margin max(5000,1920)/max(3000,1080) = 5000/3000 → bounds
  // x ∈ [−5000, 6920], y ∈ [−3000, 4080].
  const { minX, maxX } = pasteboardSceneBounds({ width: 1920, height: 1080 });

  it('passes a delta through untouched while the whole box stays inside', () => {
    // box [0, 100] moved by +200 → [200, 300] ⊆ [−5000, 6920]; unclamped.
    expect(clampDeltaToPasteboard(200, 0, 100, minX, maxX)).toBe(200);
  });

  it('clamps so the box edge stops AT the bound, never crossing (right + left)', () => {
    // box [6800, 6900], want +500 → would be [7300, 7400] past maxX 6920; allowed delta
    // is maxX − boxMax = 6920 − 6900 = 20, so the right edge touches the bound.
    expect(clampDeltaToPasteboard(500, 6800, 6900, minX, maxX)).toBe(20);
    // box [−4900, −4800] wanting −500 → past minX −5000; allowed is minX − boxMin = −100.
    expect(clampDeltaToPasteboard(-500, -4900, -4800, minX, maxX)).toBe(-100);
  });

  it('pre-existing-outside: never pushes further out, lets it move back in', () => {
    // box already LEFT-outside: [−5200, −5100] (boxMin < minX). A further-left delta is
    // refused (clamped to 0 — don't push out), but an inward (+) delta is allowed.
    expect(clampDeltaToPasteboard(-300, -5200, -5100, minX, maxX)).toBe(0);
    expect(clampDeltaToPasteboard(300, -5200, -5100, minX, maxX)).toBe(300);
  });

  it('oversized on an axis: centers the box (it cannot fit), ignoring the requested delta', () => {
    // box wider than the pasteboard span (6920 − (−5000) = 11920): width 12000, box [0, 12000].
    // Centered: center delta = (minX+maxX)/2 − (boxMin+boxMax)/2 = 960 − 6000 = −5040.
    const d = clampDeltaToPasteboard(999, 0, 12000, minX, maxX);
    expect(d).toBe((minX + maxX) / 2 - (0 + 12000) / 2);
    // After applying, the box center sits at the pasteboard center.
    expect((0 + d + (12000 + d)) / 2).toBe((minX + maxX) / 2);
  });
});

describe('B-027 — coverZoom is the cover-fit minimum (pasteboard always covers the viewport)', () => {
  // The 1920×1080 pasteboard extent is 11920 × 7080.
  const E = pasteboardLayout({ width: 1920, height: 1080 });

  it('is the MAX of the two axis ratios (cover, not contain), each biased up by the over-cover hair', () => {
    // The axis targets are nudged up by COVER_OVERSHOOT_PX before the ratio (over-cover bias).
    // A WIDE viewport: width ratio dominates.
    expect(coverZoom(1000, 500, E.width, E.height)).toBeCloseTo(
      Math.max((1000 + COVER_OVERSHOOT_PX) / E.width, (500 + COVER_OVERSHOOT_PX) / E.height),
      6,
    );
    expect(coverZoom(1000, 500, E.width, E.height)).toBe((1000 + COVER_OVERSHOOT_PX) / E.width);
    // A TALL viewport: height ratio dominates.
    expect(coverZoom(500, 1000, E.width, E.height)).toBe((1000 + COVER_OVERSHOOT_PX) / E.height);
  });

  it('OVER-covers the viewport on BOTH axes — the cover axis exceeds it by the over-cover hair, never under', () => {
    for (const [vw, vh] of [
      [1000, 500],
      [500, 1000],
      [1280, 720],
      [800, 800],
    ] as const) {
      const z = coverZoom(vw, vh, E.width, E.height);
      // scaled extent ≥ viewport on each axis → no empty surround on either side…
      expect(E.width * z).toBeGreaterThanOrEqual(vw);
      expect(E.height * z).toBeGreaterThanOrEqual(vh);
      // …and the TIGHTEST axis over-covers by EXACTLY the over-cover hair (the bias) — so the
      // pasteboard is always a sliver larger than the viewport, never exactly equal (which a
      // sub-pixel scroll would expose as surround on the trailing edges).
      const tightest = Math.min(E.width * z - vw, E.height * z - vh);
      expect(tightest).toBeCloseTo(COVER_OVERSHOOT_PX, 6);
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

describe('D-120 — high-zoom pixel grid (threshold + device-pixel snapping + ruler alignment)', () => {
  it('pixelGridVisible: hidden below the threshold, shown at/above it (one scene px ≥ 8 screen px)', () => {
    expect(PIXEL_GRID_MIN_ZOOM).toBe(8);
    expect(pixelGridVisible(1)).toBe(false); // 100%
    expect(pixelGridVisible(4)).toBe(false); // 400% — the OLD max, still no grid
    expect(pixelGridVisible(7.99)).toBe(false); // just under the threshold
    expect(pixelGridVisible(8)).toBe(true); // 800% — the threshold
    expect(pixelGridVisible(16)).toBe(true); // 1600%
    expect(pixelGridVisible(64)).toBe(true); // 6400% — the max
  });

  it('snaps every line to a whole device pixel at a FRACTIONAL zoom (crisp, not blurred)', () => {
    // The regression: at a fractional scale like 48.08× a CSS-gradient grid blurred each line
    // across two device pixels. The canvas snaps each line to `round(pos·dpr) + 0.5`, so a 1px
    // stroke lands on ONE physical pixel — crisp at ANY zoom. Pin: every devicePx is integer+0.5.
    for (const zoom of [48.08, 33, 12.5, 16, 64]) {
      const lines = pixelGridLines(137.42, zoom, 900, 1); // fractional origin + length, dpr 1
      expect(lines.length).toBeGreaterThan(0);
      for (const { devicePx } of lines) {
        expect(Number.isInteger(devicePx - 0.5)).toBe(true); // snapped to the device-pixel raster
      }
    }
  });

  it('HiDPI (devicePixelRatio = 2): lines are still snapped to a whole device pixel', () => {
    const lines = pixelGridLines(50.7, 48.08, 800, 2);
    expect(lines.length).toBeGreaterThan(0);
    for (const { devicePx } of lines) {
      expect(Number.isInteger(devicePx - 0.5)).toBe(true);
    }
  });

  it('the snap stays within half a device pixel of the true scene position (ruler-aligned)', () => {
    // The snap is a sub-pixel visual correction, not a reposition: a line for scene X still sits at
    // its true screen pos `origin + X·zoom` (the SAME mapping the rulers use) to within half a
    // device pixel — invisible as position at high zoom, but decisive for crispness. No drift: each
    // line is snapped independently, so the error never accumulates across cells.
    const origin = 137.42;
    const zoom = 48.08;
    const dpr = 1;
    const lines = pixelGridLines(origin, zoom, 900, dpr);
    for (const { scene, devicePx } of lines) {
      const truePx = (origin + scene * zoom) * dpr; // the ruler's mapping, in device px
      expect(Math.abs(devicePx - 0.5 - truePx)).toBeLessThanOrEqual(0.5);
    }
  });

  it('returns only the VISIBLE lines (viewport-culled), contiguous integer scene coords', () => {
    const origin = 137.42;
    const zoom = 48.08;
    const lines = pixelGridLines(origin, zoom, 900, 1);
    // Every returned line is inside the viewport [0, 900].
    for (const { scene } of lines) {
      const pos = origin + scene * zoom;
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(900);
    }
    // …and one step beyond each end would fall OUTSIDE (nothing extra drawn).
    expect(origin + (lines[0]!.scene - 1) * zoom).toBeLessThan(0);
    expect(origin + (lines[lines.length - 1]!.scene + 1) * zoom).toBeGreaterThan(900);
    // Contiguous scene coordinates (1 cell = 1 scene pixel; every integer coord has a line).
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.scene).toBe(lines[i - 1]!.scene + 1);
  });

  it('a MAJOR line (every 10th) is detectable via `scene % PIXEL_GRID_MAJOR_EVERY` and includes scene 0', () => {
    expect(PIXEL_GRID_MAJOR_EVERY).toBe(10);
    // Put scene 0 inside the viewport (origin within [0, length]).
    const lines = pixelGridLines(100, 16, 900, 1);
    const majors = lines.filter((l) => l.scene % PIXEL_GRID_MAJOR_EVERY === 0).map((l) => l.scene);
    expect(majors).toContain(0); // scene 0 is a major line
    expect(majors).toContain(10); // …and every 10th
    expect(majors).not.toContain(5); // a non-multiple-of-10 is minor
  });

  it('degenerate inputs yield no lines (no runaway loop)', () => {
    expect(pixelGridLines(0, 0, 900, 1)).toEqual([]); // zoom 0
    expect(pixelGridLines(0, 16, 0, 1)).toEqual([]); // length 0
    expect(pixelGridLines(0, 16, 900, 0)).toEqual([]); // dpr 0
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
