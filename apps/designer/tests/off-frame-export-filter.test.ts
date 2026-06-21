import { describe, expect, it } from 'vitest';
import type { Composition, Element, Layer, Scene, Transform } from '@cg/shared-schema';
import { editSceneOf, scopeSceneToComposition } from '../src/renderer/state/scene-doc.js';
import { isFullyOffFrame } from '../src/renderer/state/off-frame.js';
import { collectImageElements } from '../src/platform/image-export.js';

/**
 * D-071 Phase A — the EXPORT-ONLY off-frame filter. `scopeSceneToComposition`
 * (which feeds .vcg / HTML / the broadcast preview) drops fully-off-frame STATIC
 * elements so they don't bloat the package; `editSceneOf` (the canvas) keeps
 * everything. The rule is conservative — these tests prove the DROP and, critically,
 * every KEEP (animated, partially-on, under-animated-container, repeater-template,
 * edge-touching), so we never drop content that could reach the frame.
 */

// Root comp frame for most cases.
const W = 200;
const H = 100;

function tf(
  position: { x: number; y: number },
  size = { w: 50, h: 50 },
  opts: {
    rotation?: number;
    scale?: { x: number; y: number };
    anchor?: { x: number; y: number };
  } = {},
): Transform {
  return {
    position,
    size,
    scale: opts.scale ?? { x: 1, y: 1 },
    rotation: opts.rotation ?? 0,
    anchor: opts.anchor ?? { x: 0, y: 0 },
  };
}

function img(id: string, assetId: string, transform: Transform, animation?: unknown): Element {
  return {
    id,
    name: id,
    type: 'image',
    assetId,
    source: 'project',
    fit: 'contain',
    preserveAspect: true,
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    ...(animation !== undefined ? { animation } : {}),
  } as unknown as Element;
}

function container(
  id: string,
  children: Element[],
  transform: Transform,
  animation?: unknown,
): Element {
  return {
    id,
    name: id,
    type: 'container',
    clip: false,
    children,
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    ...(animation !== undefined ? { animation } : {}),
  } as unknown as Element;
}

function repeater(id: string, compositionId: string, transform: Transform): Element {
  return {
    id,
    name: id,
    type: 'repeater',
    compositionId,
    direction: 'column',
    flow: 'rtl',
    gap: 8,
    items: [{ id: 'r1' }],
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function comp(id: string, children: Element[], resolution = { width: W, height: H }): Composition {
  return {
    id,
    name: id,
    resolution,
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      { id: `L-${id}`, name: 'L', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function sceneWith(comps: Composition[]): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 'p',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    compositions: comps,
    metadata: { createdAt: '2026-06-21T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z' },
  } as unknown as Scene;
}

/** All element ids in a doc's layers, recursing containers. */
function ids(layers: readonly Layer[]): string[] {
  const out: string[] = [];
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      out.push(el.id);
      if (el.type === 'container') walk(el.children);
    }
  };
  for (const l of layers) walk(l.children);
  return out;
}

const slideInX = {
  tracks: {
    'position.x': {
      keyframes: [
        { frame: 0, value: 300, easing: 'linear' },
        { frame: 50, value: 50, easing: 'linear' },
      ],
    },
  },
};

describe('D-071 Phase A — export filter drops fully-off-frame static elements', () => {
  it('DROP: a static image fully off-frame is removed AND its asset is never gathered', () => {
    const scene = sceneWith([
      comp('R', [
        img('on', 'asset-on', tf({ x: 10, y: 10 })),
        img('off', 'asset-off', tf({ x: 300, y: 10 })),
      ]),
    ]);
    const scoped = scopeSceneToComposition(scene, 'R');
    expect(scoped).not.toBeNull();
    expect(ids(scoped!.layers)).toContain('on');
    expect(ids(scoped!.layers)).not.toContain('off');
    const assets = collectImageElements(scoped!).map((r) => r.assetId);
    expect(assets).toContain('asset-on');
    expect(assets).not.toContain('asset-off'); // its bytes are never inlined/packaged
  });

  it('canvas KEEPS it: editSceneOf (the edit projection) keeps the off-frame element', () => {
    const scene = sceneWith([
      comp('R', [
        img('on', 'asset-on', tf({ x: 10, y: 10 })),
        img('off', 'asset-off', tf({ x: 300, y: 10 })),
      ]),
    ]);
    const edited = editSceneOf(scene, 'R');
    expect(edited).not.toBeNull();
    expect(ids(edited!.layers)).toEqual(expect.arrayContaining(['on', 'off']));
  });

  // ── KEEPS (the critical negatives — proving we never drop visible content) ──

  it('KEEP (a): an element animating ON-frame (off at base, position.x track) is kept', () => {
    const scene = sceneWith([
      comp('R', [img('slide', 'asset-slide', tf({ x: 300, y: 10 }), slideInX)]),
    ]);
    expect(ids(scopeSceneToComposition(scene, 'R')!.layers)).toContain('slide');
  });

  it('KEEP (b): a partially-off element (AABB crosses the edge) is kept', () => {
    // x:180..230 crosses the right edge W=200.
    const scene = sceneWith([comp('R', [img('partial', 'asset-partial', tf({ x: 180, y: 10 }))])]);
    expect(ids(scopeSceneToComposition(scene, 'R')!.layers)).toContain('partial');
  });

  it('KEEP (c): a static off-frame element inside an ANIMATED container is kept', () => {
    const cAnim = {
      tracks: {
        'position.x': {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 50, value: -400, easing: 'linear' },
          ],
        },
      },
    };
    const scene = sceneWith([
      comp('R', [
        container(
          'cont',
          [img('inAnim', 'asset-inAnim', tf({ x: 300, y: 10 }))],
          tf({ x: 0, y: 0 }),
          cAnim,
        ),
      ]),
    ]);
    const scoped = scopeSceneToComposition(scene, 'R')!;
    expect(ids(scoped.layers)).toContain('inAnim'); // container kept whole
    expect(collectImageElements(scoped).map((r) => r.assetId)).toContain('asset-inAnim');
  });

  it('KEEP (d): a static off-frame element inside a REPEATER template is kept', () => {
    const scene = sceneWith([
      comp('R', [repeater('rep', 'Row', tf({ x: 10, y: 10 }))]),
      comp('Row', [img('rowImg', 'asset-rowImg', tf({ x: 300, y: 10 }))]),
    ]);
    const scoped = scopeSceneToComposition(scene, 'R')!;
    const rowComp = scoped.compositions!.find((c) => c.id === 'Row')!;
    expect(ids(rowComp.layers)).toContain('rowImg'); // template kept whole — stamping can place it on-frame
    expect(collectImageElements(scoped).map((r) => r.assetId)).toContain('asset-rowImg');
  });

  it('KEEP (e): an element exactly touching the boundary is kept (strict-outside drop)', () => {
    // left edge at x=200 (the frame's right boundary) — touching = partially-on.
    const scene = sceneWith([comp('R', [img('edge', 'asset-edge', tf({ x: W, y: 10 }))])]);
    expect(ids(scopeSceneToComposition(scene, 'R')!.layers)).toContain('edge');
  });

  // ── Rotation (proves the corner-based AABB, both directions) ──

  it('DROP: a rotated static element whose ROTATED AABB is fully off-frame is removed', () => {
    const scene = sceneWith([
      comp('R', [
        img('rot', 'asset-rot', tf({ x: 300, y: 300 }, { w: 50, h: 50 }, { rotation: 45 })),
      ]),
    ]);
    expect(ids(scopeSceneToComposition(scene, 'R')!.layers)).not.toContain('rot');
  });

  it('KEEP: a rotated element whose axis-aligned box is off but a CORNER rotates on-frame is kept', () => {
    // position x:210 (axis-aligned box fully right of W=200), but rotated 45° about
    // its centre a corner reaches x≈193 — a naive position check would wrongly drop it.
    const scene = sceneWith([
      comp('R', [
        img(
          'rotOn',
          'asset-rotOn',
          tf({ x: 210, y: 10 }, { w: 80, h: 80 }, { rotation: 45, anchor: { x: 0.5, y: 0.5 } }),
        ),
      ]),
    ]);
    expect(ids(scopeSceneToComposition(scene, 'R')!.layers)).toContain('rotOn');
  });
});

describe('isFullyOffFrame — boundary unit checks', () => {
  const on = (t: Transform): boolean => isFullyOffFrame(img('x', 'a', t), [], W, H);
  it('strictly right/left/below/above ⇒ off; touching/crossing ⇒ on', () => {
    expect(on(tf({ x: 300, y: 10 }))).toBe(true); // right
    expect(on(tf({ x: -60, y: 10 }))).toBe(true); // left (x:-60..-10)
    expect(on(tf({ x: 10, y: 200 }))).toBe(true); // below
    expect(on(tf({ x: 10, y: -60 }))).toBe(true); // above
    expect(on(tf({ x: W, y: 10 }))).toBe(false); // touching right edge
    expect(on(tf({ x: 180, y: 10 }))).toBe(false); // crossing
    expect(on(tf({ x: 10, y: 10 }))).toBe(false); // fully on
  });
  it('degenerate (zero-size) box ⇒ kept', () => {
    expect(on(tf({ x: 300, y: 300 }, { w: 0, h: 0 }))).toBe(false);
  });
});
