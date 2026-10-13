import { describe, expect, it } from 'vitest';
import type { Transform } from '../src/primitives.js';
import type { Element } from '../src/elements.js';
import type { Scene } from '../src/scene.js';
import {
  applyAffine,
  composeAffine,
  elementToScene,
  flattenElements,
  invertAffine,
  localToParent,
  sceneRect,
  transformToParent,
  IDENTITY_AFFINE,
} from '../src/scene-flatten.js';

/**
 * 1.5c — **the affine kernel, pinned against the point-mapping formula it replaced.**
 *
 * 🔴 **Why this file exists.** `localToParent` was `frameAabb`'s per-level kernel,
 * lifted verbatim into `@cg/vcg-format` in C-015 and now lifted again into this
 * package, where it is no longer spelled out: it is DERIVED from
 * {@link transformToParent}, because 1.5c needs the map BACKWARD (a plate's scene
 * rect, expressed in the local box of an element below it) and an inverse cannot be
 * spelled in the point-mapping form.
 *
 * The rewrite is the risk. A second, independently-derived spelling of one
 * geometry is precisely what this repo keeps paying for — and here the two ends are
 * a hole the PAGE punches and a hole the BRIDGE fills, so a divergence puts the
 * backdrop's own colour where the guest should be and nothing on air says which
 * side was wrong. So the ORIGINAL formula is written out below, once, and the
 * derived kernel is required to agree with it.
 */

/** The original `off-frame.ts:50-60` kernel, verbatim — the reference, not the impl. */
function referenceLocalToParent(t: Transform, lx: number, ly: number): { x: number; y: number } {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = lx - t.anchor.x * t.size.w;
  const oy = ly - t.anchor.y * t.size.h;
  return {
    x: t.position.x + t.anchor.x * t.size.w + t.scale.x * (ox * cos - oy * sin),
    y: t.position.y + t.anchor.y * t.size.h + t.scale.y * (ox * sin + oy * cos),
  };
}

const TRANSFORMS: readonly Transform[] = [
  // The plain case every real scene is made of.
  {
    position: { x: 0, y: 0 },
    size: { w: 1920, h: 1080 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  // Offset + non-uniform scale, anchored at the centre.
  {
    position: { x: 137, y: -42 },
    size: { w: 640, h: 360 },
    scale: { x: 2.5, y: 0.75 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
  },
  // Rotated about a corner — the case that made `sceneRect` map four corners.
  {
    position: { x: 100, y: 200 },
    size: { w: 300, h: 150 },
    scale: { x: 1, y: 1 },
    rotation: 33,
    anchor: { x: 1, y: 0 },
  },
  // Rotation AND non-uniform scale AND a fractional anchor, all at once.
  {
    position: { x: -18.5, y: 900.25 },
    size: { w: 77, h: 1024 },
    scale: { x: -1.5, y: 3 },
    rotation: -117.5,
    anchor: { x: 0.25, y: 0.8 },
  },
];

const POINTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [640, 360],
  [-250.5, 1e4],
];

describe('1.5c — the affine kernel agrees with the formula it replaced', () => {
  it('localToParent === the original off-frame.ts kernel, on every transform', () => {
    for (const t of TRANSFORMS) {
      for (const [lx, ly] of POINTS) {
        const derived = localToParent(t, lx, ly);
        const reference = referenceLocalToParent(t, lx, ly);
        expect(derived.x, `x @ (${String(lx)}, ${String(ly)})`).toBeCloseTo(reference.x, 10);
        expect(derived.y, `y @ (${String(lx)}, ${String(ly)})`).toBeCloseTo(reference.y, 10);
      }
    }
  });

  it('invertAffine round-trips every non-singular transform', () => {
    // The property 1.5c actually depends on: a scene-px hole pulled back into an
    // element's own box must land where it started when pushed out again.
    for (const t of TRANSFORMS) {
      const m = transformToParent(t);
      const inverse = invertAffine(m);
      expect(inverse).not.toBeNull();
      for (const [lx, ly] of POINTS) {
        const there = applyAffine(m, lx, ly);
        const back = applyAffine(inverse ?? IDENTITY_AFFINE, there.x, there.y);
        expect(back.x).toBeCloseTo(lx, 8);
        expect(back.y).toBeCloseTo(ly, 8);
      }
    }
  });

  it('a COLLAPSED transform inverts to null, and null is not identity', () => {
    // 🔴 Zero is a value, and `scale.x === 0` is a real authored state. A singular
    // matrix must be refused rather than silently treated as identity: an element
    // scaled to nothing paints nothing, so there is no space to express a hole in,
    // and inventing one would punch a hole in whatever DOES paint.
    const collapsed = invertAffine(
      transformToParent({
        position: { x: 10, y: 10 },
        size: { w: 100, h: 100 },
        scale: { x: 0, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      }),
    );
    expect(collapsed).toBeNull();
    // The paired ONE, as the control: a scale of 1 on the same transform inverts.
    expect(
      invertAffine(
        transformToParent({
          position: { x: 10, y: 10 },
          size: { w: 100, h: 100 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0, y: 0 },
        }),
      ),
    ).not.toBeNull();
  });

  it('composeAffine applies its RIGHT operand first', () => {
    // Order is the whole correctness of a nested chain, and both orders type-check.
    const translate = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 };
    const double = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
    expect(applyAffine(composeAffine(double, translate), 1, 0).x).toBe(22);
    expect(applyAffine(composeAffine(translate, double), 1, 0).x).toBe(12);
  });
});

// ── THE WALK, AND §9a-Z's PRE-PASS ──────────────────────────────────────────

const box = (x: number, y: number, w: number, h: number): Transform => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const base = { opacity: 1, visible: true, locked: false };

const rect = (id: string, t: Transform, zIndex: number): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#d00000' },
    transform: t,
    zIndex,
  }) as unknown as Element;

const container = (id: string, t: Transform, zIndex: number, children: Element[]): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'container',
    transform: t,
    zIndex,
    children,
  }) as unknown as Element;

function sceneWith(children: Element[], compositions: unknown[] = []): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

describe('1.5c — flattenElements: ONE walk, two sibling orders', () => {
  it("'document' keeps the authored array order; 'paint' sorts by zIndex", () => {
    // 🔴 Both orders matter and they are NOT interchangeable. `collectLiveSources`
    // declares in DOCUMENT order — its contract is that an unchanged scene exports an
    // unchanged declaration array. The punch needs PAINT order, because "above" is what
    // `buildLayer` actually appends, and that is zIndex.
    const scene = sceneWith([rect('a', box(0, 0, 10, 10), 5), rect('b', box(0, 0, 10, 10), 1)]);
    expect(flattenElements(scene, 'document').map((f) => f.element.id)).toEqual(['a', 'b']);
    expect(flattenElements(scene, 'paint').map((f) => f.element.id)).toEqual(['b', 'a']);
  });

  it('folds a container chain into scene pixels', () => {
    const scene = sceneWith([
      container('c', box(100, 50, 800, 600), 0, [rect('inner', box(20, 10, 40, 30), 0)]),
    ]);
    const inner = flattenElements(scene).find((f) => f.element.id === 'inner');
    expect(inner?.rect).toEqual({ x: 120, y: 60, width: 40, height: 30 });
  });

  it("a composition instance's INNER SCALE is applied, and keys are per-instance", () => {
    // The same authored child, instanced TWICE, has two DOM copies at two different
    // scene positions — so a map keyed by the bare element id would give one of them
    // the other's hole. The key is the instance PATH.
    const comp = {
      id: 'comp-1',
      name: 'lower third',
      resolution: { width: 960, height: 540 },
      editorBackdrop: 'transparent',
      layers: [
        {
          id: 'cl',
          name: 'l',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [rect('child', box(100, 100, 200, 100), 0)],
        },
      ],
      fields: [],
      bindings: [],
    };
    const scene = sceneWith(
      [
        {
          ...base,
          id: 'i1',
          name: 'i1',
          type: 'composition',
          compositionId: 'comp-1',
          transform: box(0, 0, 480, 270),
          zIndex: 0,
        } as unknown as Element,
        {
          ...base,
          id: 'i2',
          name: 'i2',
          type: 'composition',
          compositionId: 'comp-1',
          transform: box(1000, 0, 960, 540),
          zIndex: 1,
        } as unknown as Element,
      ],
      [comp],
    );
    const flat = flattenElements(scene);
    const first = flat.find((f) => f.key === 'i1/child');
    const second = flat.find((f) => f.key === 'i2/child');
    // i1 renders the 960×540 comp into a 480×270 box — a 0.5 inner scale.
    expect(first?.rect).toEqual({ x: 50, y: 50, width: 100, height: 50 });
    // i2 renders it 1:1, offset by 1000.
    expect(second?.rect).toEqual({ x: 1100, y: 100, width: 200, height: 100 });
  });

  it('sceneRect and elementToScene agree — the rect IS the mapped box', () => {
    const rotated: Transform = {
      position: { x: 40, y: 40 },
      size: { w: 100, h: 60 },
      scale: { x: 1, y: 1 },
      rotation: 90,
      anchor: { x: 0, y: 0 },
    };
    const el = rect('r', rotated, 0);
    const m = elementToScene(el, []);
    const corner = applyAffine(m, 100, 60);
    const box2 = sceneRect(el, []);
    expect(corner.x).toBeCloseTo(box2.x, 8);
    // A 90° rotation swaps the extents — proof the AABB maps all four corners.
    expect(box2.width).toBeCloseTo(60, 8);
    expect(box2.height).toBeCloseTo(100, 8);
  });
});

/*
 * 🔴 **`single-clock-look-switch` — the mask block that stood here is GONE with `sceneMaskHoles`.**
 *
 * It pinned §9a-Z's z-order punch: which element carries which holes, that a container is
 * masked through its children, that touching edges do not count, that a collapsed element
 * expresses none. The rule is not refuted — it was correct for a page composited ON TOP of
 * its plates — but a plate-bearing package now loads onto the LOW bank and its pictures are
 * composited over it, so no element of the page is ever in front of a plate.
 *
 * ⚠ What the block ALSO covered and is still tested elsewhere: `flattenElements`' own walk
 * and sibling orders (the two blocks above), and the geometry a plate reports to the bridge
 * (`collectLiveSources`, in `@cg/vcg-format`).
 */
