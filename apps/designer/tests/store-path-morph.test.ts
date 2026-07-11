import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SceneSchema,
  isPathKeyframeValue,
  pathVisualBBox,
  type AnchorPoint,
  type Element,
  type PathElement,
  type Scene,
} from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { Exporter } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { pathFromScenePoints } from '../src/renderer/state/element-defaults.js';
import {
  effectivePathBoxPoints,
  effectivePathLocalRect,
  effectivePathPoints,
  timelineGroupsFor,
  type TimelineRow,
} from '../src/renderer/features/timeline/keyframe-helpers.js';
import { hitsElement } from '../src/renderer/features/canvas/hit-test.js';
import { addOrToggleKeyframeAtFrame } from '../src/renderer/features/timeline/TrackRow.js';
import { descriptorsForKind } from '../src/renderer/features/inspector/field-registry.js';

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

/** A fresh scene holding one triangle path element (ids a/b/c, local 0-origin). */
function freshSceneWithPath(): PathElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('morph-test', 'custom');
  designerStore.setScene(scene, null);
  const path = pathFromScenePoints(
    'path-1',
    [corner('a', 0, 0), corner('b', 100, 0), corner('c', 100, 80)],
    true,
  );
  designerStore.addElement(path);
  return path;
}

function pathEl(): PathElement {
  const state = designerStore.get();
  const el = editSceneOf(state.scene, state.activeCompositionId)!.layers[0]!.children[0]!;
  if (el.type !== 'path') throw new Error('expected the path element');
  return el;
}

function pathRow(el: Element): TimelineRow {
  for (const group of timelineGroupsFor(el)) {
    for (const entry of group.rows) {
      if (entry.kind === 'animatable' && entry.row.property === 'path') return entry.row;
    }
  }
  throw new Error('no Path timeline row');
}

/** Snapshot of the CURRENT static points with one anchor moved by (dx, dy). */
function movedSnapshot(el: PathElement, id: string, dx: number, dy: number) {
  return {
    kind: 'path' as const,
    points: el.points.map((p) => (p.id === id ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
  };
}

beforeEach(() => {
  freshSceneWithPath();
});

afterEach(() => {
  designerStore._reset();
});

describe('D-110 — the single Path timeline row (registry)', () => {
  it('a path element exposes exactly ONE `path` descriptor/row, first (Loopic order)', () => {
    const el = pathEl();
    const pathDescs = descriptorsForKind('path').filter((d) => d.property === 'path');
    expect(pathDescs).toHaveLength(1);
    const groups = timelineGroupsFor(el);
    expect(groups[0]?.title).toBe('Path');
    expect(groups[0]?.rows).toHaveLength(1);
    const rows = groups
      .flatMap((g) => g.rows)
      .filter((r) => r.kind === 'animatable' && r.row.property === 'path');
    expect(rows).toHaveLength(1); // one row for the whole shape — never per anchor
  });

  it('non-path kinds expose no `path` descriptor', () => {
    for (const kind of ['shape', 'text', 'image', 'ticker'] as const) {
      expect(descriptorsForKind(kind).some((d) => d.property === 'path')).toBe(false);
    }
  });
});

describe('D-110 — diamond capture (shared TrackRow code path)', () => {
  it('adding the first Path keyframe captures a deep-cloned snapshot of the anchor set', () => {
    const el = pathEl();
    designerStore.setCurrentFrame(10);
    addOrToggleKeyframeAtFrame(el, pathRow(el), 10);
    const track = pathEl().animation?.tracks['path'];
    expect(track?.keyframes).toHaveLength(1);
    const value = track?.keyframes[0]?.value;
    if (!isPathKeyframeValue(value)) throw new Error('expected a path snapshot');
    expect(value.points).toEqual(el.points);
    expect(value.points).not.toBe(el.points); // deep-cloned, never aliased
  });

  it('toggling the diamond on the same frame removes the keyframe (and the track)', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 10);
    addOrToggleKeyframeAtFrame(pathEl(), pathRow(el), 10);
    expect(pathEl().animation?.tracks['path']).toBeUndefined();
  });
});

describe('D-110 — track-aware point edits (commitAnimatable routing)', () => {
  it('with NO track the edit writes the static points (normalize route), no keyframe', () => {
    const before = pathEl();
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(before, 'c', 0, 40));
    const after = pathEl();
    expect(after.animation).toBeUndefined();
    // normalize keeps the 0-origin invariant; the shape grew 40 down on 'c'.
    expect(after.points.find((p) => p.id === 'c')?.y).toBe(120);
    expect(after.transform.size.h).toBe(120);
  });

  it('editing at a NEW frame auto-records a keyframe; static points stay frozen', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    const staticBefore = pathEl().points;
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'b', 0, -50));
    const after = pathEl();
    const kfs = after.animation?.tracks['path']?.keyframes;
    expect(kfs?.map((k) => k.frame)).toEqual([0, 30]);
    const v30 = kfs?.[1]?.value;
    if (!isPathKeyframeValue(v30)) throw new Error('expected a path snapshot');
    expect(v30.points.find((p) => p.id === 'b')?.y).toBe(-50);
    // The first keyframe and the static base are untouched.
    const v0 = kfs?.[0]?.value;
    if (!isPathKeyframeValue(v0)) throw new Error('expected a path snapshot');
    expect(v0.points).toEqual(staticBefore);
    expect(after.points).toEqual(staticBefore);
    expect(after.transform.size).toEqual(el.transform.size);
  });

  it('editing ON an existing keyframe frame updates that keyframe in place', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(0);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'a', 5, 5));
    const kfs = pathEl().animation?.tracks['path']?.keyframes;
    expect(kfs).toHaveLength(1);
    const v = kfs?.[0]?.value;
    if (!isPathKeyframeValue(v)) throw new Error('expected a path snapshot');
    expect(v.points.find((p) => p.id === 'a')).toMatchObject({ x: 5, y: 5 });
  });
});

describe('D-110 — effectivePathPoints (overlay/hit-test seam)', () => {
  it('returns the static points when no track exists', () => {
    const el = pathEl();
    expect(effectivePathPoints(el, 25)).toBe(el.points);
  });

  it('returns the id-matched interpolated set between two keyframes', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(40);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'c', -80, 0));
    const mid = effectivePathPoints(pathEl(), 20);
    expect(mid.find((p) => p.id === 'c')?.x).toBeCloseTo(60); // 100 → 20, halfway
    expect(mid.find((p) => p.id === 'a')).toMatchObject({ x: 0, y: 0 });
  });
});

describe('D-110 — a path track round-trips through the scene schema', () => {
  it('two shape keyframes survive serialize → parse with ids, handles, and easing intact', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('path-1', 'path', {
      kind: 'path',
      points: el.points.map((p) =>
        p.id === 'b' ? { ...p, x: 40, y: -20, out: { x: 10, y: 5 }, smooth: true } : { ...p },
      ),
    });
    designerStore.setKeyframeEasing('path-1', 'path', 0, 'ease-in-out');
    const scene = designerStore.get().scene;
    // The exporters serialize the scene verbatim (JSON.stringify), so a JSON
    // round-trip + schema parse is exactly the `.vcg` / single-file HTML path.
    const parsed = SceneSchema.parse(JSON.parse(JSON.stringify(scene))) as Scene;
    const allEls = [
      ...parsed.layers.flatMap((l) => l.children),
      ...(parsed.compositions ?? []).flatMap((c) => c.layers.flatMap((l) => l.children)),
    ];
    const el2 = allEls.find((e) => e.id === 'path-1');
    if (el2?.type !== 'path') throw new Error('expected the path element');
    const track = el2.animation?.tracks['path'];
    expect(track?.keyframes.map((k) => k.frame)).toEqual([0, 30]);
    expect(track?.keyframes[0]?.easing).toBe('ease-in-out');
    const v30 = track?.keyframes[1]?.value;
    if (!isPathKeyframeValue(v30)) throw new Error('expected a path snapshot');
    expect(v30.points.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(v30.points.find((p) => p.id === 'b')).toMatchObject({
      x: 40,
      y: -20,
      out: { x: 10, y: 5 },
      smooth: true,
    });
  });
});

describe('D-110 — static resize scales every snapshot (one local space)', () => {
  it('writeStaticAnimatable(size.w) bakes the scale into static points AND path keyframes', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'b', 0, -50));
    designerStore.writeStaticAnimatable('path-1', 'size.w', 200); // 100 → 200 (×2 on x)
    const after = pathEl();
    expect(after.transform.size.w).toBe(200);
    expect(after.points.find((p) => p.id === 'b')?.x).toBe(200);
    for (const kf of after.animation?.tracks['path']?.keyframes ?? []) {
      if (!isPathKeyframeValue(kf.value)) throw new Error('expected a path snapshot');
      expect(kf.value.points.find((p) => p.id === 'b')?.x).toBe(200);
      expect(kf.value.points.find((p) => p.id === 'c')?.x).toBe(200);
    }
  });
});

describe('D-110 structure lock — insert/delete propagate to every keyframe (2026-07-11)', () => {
  /** Author two keyframes: kf0 = the base triangle, kf30 = anchor `b` moved. */
  function keyframedTriangle(): PathElement {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'b', 60, 40));
    return pathEl();
  }

  function snapshotPoints(frame: number): readonly AnchorPoint[] {
    const kfs = pathEl().animation?.tracks['path']?.keyframes ?? [];
    const kf = kfs.find((k) => k.frame === frame);
    if (!isPathKeyframeValue(kf?.value)) throw new Error(`no path snapshot at frame ${frame}`);
    return kf.value.points;
  }

  it("a corner insert adds ONE shared id to static + BOTH keyframes at each set's own t, and it tweens", () => {
    keyframedTriangle();
    // Segment 0 is a→b: kf0 has b at (100,0), kf30 at (160,40) — the midpoint differs per set.
    designerStore.insertPathAnchorAll('path-1', 0, 0.5, 'mid-1', { kind: 'corner' });
    const after = pathEl();
    expect(after.points.map((p) => p.id)).toEqual(['a', 'mid-1', 'b', 'c']);
    const at0 = snapshotPoints(0);
    const at30 = snapshotPoints(30);
    expect(at0.map((p) => p.id)).toEqual(['a', 'mid-1', 'b', 'c']);
    expect(at30.map((p) => p.id)).toEqual(['a', 'mid-1', 'b', 'c']);
    // Positioned on each keyframe's OWN (straight) segment at t = 0.5.
    expect(at0.find((p) => p.id === 'mid-1')).toMatchObject({ x: 50, y: 0, smooth: false });
    expect(at30.find((p) => p.id === 'mid-1')).toMatchObject({ x: 80, y: 20 });
    // Shared id ⇒ the new anchor TWEENS between its two positions.
    const mid = effectivePathPoints(pathEl(), 15).find((p) => p.id === 'mid-1');
    expect(mid?.x).toBeCloseTo(65);
    expect(mid?.y).toBeCloseTo(10);
  });

  it('a smooth-drag insert carries the SAME mirrored handles into every set', () => {
    keyframedTriangle();
    designerStore.insertPathAnchorAll('path-1', 0, 0.5, 'mid-2', {
      kind: 'smooth-drag',
      out: { x: 12, y: -8 },
    });
    for (const pts of [pathEl().points, snapshotPoints(0), snapshotPoints(30)]) {
      const mid = pts.find((p) => p.id === 'mid-2');
      expect(mid).toMatchObject({ smooth: true, out: { x: 12, y: -8 }, in: { x: -12, y: 8 } });
    }
  });

  it("the menu's Add curve point derives tangent handles from EACH set's own curve", () => {
    keyframedTriangle();
    designerStore.insertPathAnchorAll('path-1', 0, 0.5, 'mid-3', { kind: 'smooth-tangent' });
    const h0 = snapshotPoints(0).find((p) => p.id === 'mid-3')?.out;
    const h30 = snapshotPoints(30).find((p) => p.id === 'mid-3')?.out;
    // kf0's a→b runs along +x (tangent (1,0)); kf30's runs toward (160,40).
    expect(h0?.y).toBeCloseTo(0);
    expect(h30?.y ?? 0).toBeGreaterThan(0);
  });

  it('delete removes the id from static + every keyframe; below-2 deletes the element', () => {
    keyframedTriangle();
    designerStore.removePathAnchorAll('path-1', 'b');
    expect(pathEl().points.map((p) => p.id)).toEqual(['a', 'c']);
    expect(snapshotPoints(0).map((p) => p.id)).toEqual(['a', 'c']);
    expect(snapshotPoints(30).map((p) => p.id)).toEqual(['a', 'c']);
    designerStore.removePathAnchorAll('path-1', 'c'); // 2 → below 2: whole element goes
    const state = designerStore.get();
    const children =
      editSceneOf(state.scene, state.activeCompositionId)?.layers.flatMap((l) => l.children) ?? [];
    expect(children.some((c) => c.id === 'path-1')).toBe(false);
  });

  it('a structural edit re-normalizes: the invariant holds and snapshots shift with the frame', () => {
    keyframedTriangle();
    const before30 = snapshotPoints(30);
    // Deleting 'a' (the 0,0 corner) moves the static bbox origin to x=100 → the
    // local frame shifts by −100 and every snapshot must shift with it.
    designerStore.removePathAnchorAll('path-1', 'a');
    const after = pathEl();
    const vb = pathVisualBBox(after.points, after.closed);
    expect(vb.x).toBe(0); // invariant: static bbox at local origin
    expect(vb.y).toBe(0);
    const b30 = snapshotPoints(30).find((p) => p.id === 'b');
    const b30Before = before30.find((p) => p.id === 'b');
    expect(b30?.x).toBeCloseTo((b30Before?.x ?? 0) - 100);
    expect(b30?.y).toBeCloseTo(b30Before?.y ?? 0);
  });

  it('Alt-break propagates the smooth FLAG while each keyframe keeps its own handle values', () => {
    const el = pathEl();
    // Give 'b' a smooth pair, keyframe it, then reshape the handle at frame 30.
    designerStore.updateElement('path-1', {
      points: el.points.map((p) =>
        p.id === 'b' ? { ...p, smooth: true, out: { x: 10, y: 0 }, in: { x: -10, y: 0 } } : p,
      ),
    } as Partial<Element>);
    const smoothed = pathEl();
    addOrToggleKeyframeAtFrame(smoothed, pathRow(smoothed), 0);
    designerStore.setCurrentFrame(30);
    designerStore.commitAnimatable('path-1', 'path', {
      kind: 'path',
      points: smoothed.points.map((p) =>
        p.id === 'b' ? { ...p, out: { x: 30, y: 5 }, in: { x: -30, y: -5 } } : { ...p },
      ),
    });
    designerStore.setPathAnchorShapeAll('path-1', 'b', { smooth: false });
    const b0 = snapshotPoints(0).find((p) => p.id === 'b');
    const b30 = snapshotPoints(30).find((p) => p.id === 'b');
    expect(b0?.smooth).toBe(false);
    expect(b30?.smooth).toBe(false);
    expect(b0?.out).toEqual({ x: 10, y: 0 }); // per-keyframe handle VALUES kept
    expect(b30?.out).toEqual({ x: 30, y: 5 });
    expect(pathEl().points.find((p) => p.id === 'b')?.smooth).toBe(false);
  });
});

describe('D-110 live bounds — effectivePathLocalRect (2026-07-11)', () => {
  it('returns null for trackless paths and non-paths (other kinds keep their bounds)', () => {
    expect(effectivePathLocalRect(pathEl(), 10)).toBeNull();
  });

  it('tracks the morphed extents at mid-frames, including growth beyond the base', () => {
    const el = pathEl(); // base bbox 100×80
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(40);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'b', 100, 0)); // b → x 200
    expect(effectivePathLocalRect(pathEl(), 0)).toMatchObject({ x: 0, y: 0, w: 100, h: 80 });
    expect(effectivePathLocalRect(pathEl(), 40)?.w).toBeCloseTo(200); // grown beyond base
    expect(effectivePathLocalRect(pathEl(), 20)?.w).toBeCloseTo(150); // mid-morph
  });

  it('reports a negative-offset rect when the morph moves before the local origin', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(40);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'a', -50, -20));
    const r = effectivePathLocalRect(pathEl(), 40);
    expect(r?.x).toBeCloseTo(-50);
    expect(r?.y).toBeCloseTo(-20);
    expect(r?.w).toBeCloseTo(150);
  });
});

describe('D-110 live hit-test — the morphed outline is the hit region (2026-07-11)', () => {
  /** A clone as CanvasOverlay builds it: box-space EFFECTIVE points + a path track. */
  function morphClone(points: AnchorPoint[]): PathElement {
    return {
      id: 'hit-1',
      name: 'Path',
      type: 'path',
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 0,
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 80 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      closed: true,
      points,
      animation: {
        tracks: {
          path: { keyframes: [{ frame: 0, value: { kind: 'path', points }, easing: 'linear' }] },
        },
      },
    };
  }

  it('a click inside the GROWN region (outside the base box) hits a keyframed path', () => {
    // The morph grew the triangle to x=150 while the base box stays 100 wide.
    const el = morphClone([corner('a', 0, 0), corner('b', 150, 0), corner('c', 0, 80)]);
    expect(hitsElement(el, { x: 120, y: 10 })).toBe(true); // grown-only region
    expect(hitsElement(el, { x: 120, y: 70 })).toBe(false); // outside the morphed outline
  });

  it('a trackless path still maps through its own visual bbox (legacy robustness)', () => {
    const el = morphClone([corner('a', 0, 0), corner('b', 150, 0), corner('c', 0, 80)]);
    const { animation: _omit, ...trackless } = el;
    void _omit;
    // Without a track the 150-wide points squeeze onto the 100-wide box, so the
    // same click lands differently — the pre-D-110 mapping is preserved.
    expect(hitsElement(trackless as Element, { x: 120, y: 10 })).toBe(false);
    expect(hitsElement(trackless as Element, { x: 60, y: 10 })).toBe(true);
  });

  it('the CanvasOverlay clone seam (effectivePathBoxPoints) yields box-space points', () => {
    const el = pathEl();
    addOrToggleKeyframeAtFrame(el, pathRow(el), 0);
    designerStore.setCurrentFrame(40);
    designerStore.commitAnimatable('path-1', 'path', movedSnapshot(el, 'b', 100, 0));
    const box = effectivePathBoxPoints(pathEl(), 40);
    // size==visualBBox ⇒ identity mapping: the grown anchor stays at x=200.
    expect(box?.find((p) => p.id === 'b')?.x).toBeCloseTo(200);
    expect(effectivePathBoxPoints(pathEl(), 0)?.find((p) => p.id === 'b')?.x).toBeCloseTo(100);
  });
});

describe('D-110 — preflight warns on mismatched adjacent snapshots', () => {
  function sceneWithTrack(kfPoints: AnchorPoint[][]): Scene {
    const el = pathEl();
    let frame = 0;
    for (const points of kfPoints) {
      designerStore.upsertKeyframe('path-1', 'path', frame, { kind: 'path', points });
      frame += 25;
    }
    void el;
    const state = designerStore.get();
    return state.scene as Scene;
  }

  function makeExporter(): Exporter {
    return new Exporter({
      assets: { list: async () => [] } as unknown as AssetStore,
      cgJs: 'export const x = 1;',
      cgCss: 'html{background:transparent}',
    });
  }

  it('adjacent keyframes with DIFFERENT anchor-id sets produce the warning', async () => {
    const scene = sceneWithTrack([
      [corner('a', 0, 0), corner('b', 100, 0)],
      [corner('a', 10, 0), corner('b', 100, 0), corner('n', 50, 50)],
    ]);
    const issues = await makeExporter().preflight(scene);
    const warn = issues.find((i) => i.code === 'path-morph-anchor-mismatch');
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning'); // the fallback is defined behavior — never an error
    expect(warn?.elementId).toBe('path-1');
  });

  it('matching id sets stay silent', async () => {
    const scene = sceneWithTrack([
      [corner('a', 0, 0), corner('b', 100, 0)],
      [corner('a', 40, 20), corner('b', 100, 80)],
    ]);
    const issues = await makeExporter().preflight(scene);
    expect(issues.some((i) => i.code === 'path-morph-anchor-mismatch')).toBe(false);
  });
});
