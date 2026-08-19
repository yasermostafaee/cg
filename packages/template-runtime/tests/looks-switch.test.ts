import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 1D — **the 6-box fixture: the switch is a
 * visibility flip plus a re-punch, and NOTHING else.**
 *
 * Six sources; a 6-box look (3×2), a solo look, and two single-purpose looks that differ
 * from the 6-box CELL 1 on exactly one axis each — so a one-axis-blind reader cannot pass
 * (D.4: three defects in four sessions came from one-axis suites). Every switch test
 * asserts BOTH halves: where the plates are (instance visibility; nothing inside moved)
 * AND where the holes are (the backdrop's mask).
 */

const baseElProps = { opacity: 1, visible: true, locked: false };

const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const el = (type: string, id: string, t: ReturnType<typeof tf>, over = {}): Element =>
  ({ ...baseElProps, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

const plate = (id: string, routeKey: string, x: number, y: number, w: number, h: number): Element =>
  el('video-placeholder', id, tf(x, y, w, h), { routeKey });

const BACKDROP = el('shape', 'backdrop', tf(0, 0, 1920, 1080), {
  shape: 'rectangle',
  fill: { kind: 'solid', color: '#d00000' },
  zIndex: 0,
});

/** The 3×2 grid — six 640×540 cells. */
const GRID = [
  { x: 0, y: 0 },
  { x: 640, y: 0 },
  { x: 1280, y: 0 },
  { x: 0, y: 540 },
  { x: 640, y: 540 },
  { x: 1280, y: 540 },
];

const comp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

const instance = (id: string, compId: string): Element =>
  el('composition', id, tf(0, 0, 1920, 1080), { compositionId: compId, zIndex: 10 });

const cut = { mode: 'cut' } as const;

function scene(): Scene {
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
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          BACKDROP,
          instance('inst-six', 'comp-six'),
          instance('inst-pair', 'comp-pair'),
          instance('inst-big', 'comp-big'),
          instance('inst-solo', 'comp-solo'),
        ],
      },
    ],
    compositions: [
      comp(
        'comp-six',
        GRID.map((c, i) =>
          plate(`six-p${String(i + 1)}`, `guest-${String(i + 1)}`, c.x, c.y, 640, 540),
        ),
      ),
      // vs cell 1 (0,0,640,540): MOVED only.
      comp('comp-pair', [plate('pair-p1', 'guest-1', 640, 0, 640, 540)]),
      // vs cell 1: RESIZED only.
      comp('comp-big', [plate('big-p1', 'guest-1', 0, 0, 1280, 1080)]),
      // vs cell 1: BOTH axes.
      comp('comp-solo', [plate('solo-p1', 'guest-1', 320, 180, 1280, 720)]),
    ],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'g1',
        sources: GRID.map((_, i) => ({ routeKey: `guest-${String(i + 1)}`, dynamic: false })),
        looks: [
          { id: 'look-six', name: 'Six', instanceId: 'inst-six', entered: cut },
          { id: 'look-pair', name: 'Pair', instanceId: 'inst-pair', entered: cut },
          { id: 'look-big', name: 'Big', instanceId: 'inst-big', entered: cut },
          { id: 'look-solo', name: 'Solo', instanceId: 'inst-solo', entered: cut },
        ],
        defaultLookId: 'look-six',
      },
    ],
  } as unknown as Scene;
}

function boot(sceneOverride?: Scene): {
  runtime: ReturnType<typeof createRuntime>;
  root: HTMLElement;
} {
  const window = new Window();
  const doc = window.document as unknown as Document;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const runtime = createRuntime(sceneOverride ?? scene(), { root: host });
  return { runtime, root: host.querySelector('.cg-stage') as HTMLElement };
}

/** ALL holes punched into the backdrop, sorted (y, then x) for stable comparison. */
function holes(root: HTMLElement): { x: number; y: number; w: number; h: number }[] {
  const node = root.querySelector<HTMLElement>('[data-cg-element-id="backdrop"]');
  const svg = decodeURIComponent(node?.style.getPropertyValue('mask-image') ?? '');
  if (svg === '') return [];
  const num = (rect: string, k: string): number =>
    Number(new RegExp(`${k}='(-?[\\d.]+)'`).exec(rect)?.[1] ?? NaN);
  return [...svg.matchAll(/<rect [^>]*fill='#000'[^>]*\/>/g)]
    .map((m) => m[0])
    .map((r) => ({ x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function displayOf(root: HTMLElement, id: string): string {
  return root.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.display ?? '?';
}

const INSTANCES = ['inst-six', 'inst-pair', 'inst-big', 'inst-solo'];
const SIX_HOLES = GRID.map((c) => ({ x: c.x, y: c.y, w: 640, h: 540 }));

describe('boot — a fresh build enters the DEFAULT look', () => {
  it('exactly one look visible from the start: six shown, the other three display:none', () => {
    const { runtime, root } = boot();
    expect(runtime.activeLookId()).toBe('look-six');
    expect(displayOf(root, 'inst-six')).not.toBe('none');
    for (const id of ['inst-pair', 'inst-big', 'inst-solo']) {
      expect(displayOf(root, id)).toBe('none');
    }
  });

  it('only the ACTIVE look punches: exactly the six grid holes, none from the hidden looks', () => {
    const { root } = boot();
    expect(holes(root)).toEqual(SIX_HOLES);
  });
});

describe('the switch — a visibility flip + re-punch, and nothing else', () => {
  it('🔴 six → solo: one hole, the flipped instances, and NO GEOMETRY inside any look moved', () => {
    const { runtime, root } = boot();
    // ⚠ Geometry, not innerHTML: the ACTIVE plate legitimately punches INTO the hidden
    // plates below it in z-order (suppression governs the PUNCHER, never the punched), so
    // their mask properties may change. What must NOT change is where anything sits —
    // under LOOKS a switch moves NOTHING. The byte-identical claim is the ROUND TRIP's,
    // below, where the transient masks must have been cleared again.
    const geomOf = (): Record<string, string>[] =>
      [...root.querySelectorAll<HTMLElement>('[data-cg-element-id^="six-p"]')].map((n) => ({
        left: n.style.left,
        top: n.style.top,
        width: n.style.width,
        height: n.style.height,
      }));
    const geomBefore = geomOf();
    expect(geomBefore).toHaveLength(6);

    expect(runtime.setActiveLook('look-solo')).toBe(true);

    expect(runtime.activeLookId()).toBe('look-solo');
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
    expect(displayOf(root, 'inst-solo')).not.toBe('none');
    expect(displayOf(root, 'inst-six')).toBe('none');
    expect(geomOf()).toEqual(geomBefore);
    // The backdrop itself was never hidden — the switch touches looks, not the scene.
    expect(displayOf(root, 'backdrop')).not.toBe('none');
  });

  it('🔴 solo-and-back RESTORES EXACTLY — holes, visibility AND the whole subtree, byte-identical', () => {
    const { runtime, root } = boot();
    const holesBefore = holes(root);
    const displaysBefore = INSTANCES.map((id) => displayOf(root, id));
    const sixBefore = root.querySelector('[data-cg-element-id="inst-six"]')?.innerHTML;

    runtime.setActiveLook('look-solo');
    runtime.setActiveLook('look-six');

    expect(holes(root)).toEqual(holesBefore);
    expect(INSTANCES.map((id) => displayOf(root, id))).toEqual(displaysBefore);
    expect(runtime.activeLookId()).toBe('look-six');
    // The transient masks the solo plate punched into six's hidden plates are CLEARED
    // again — "had a hole, has NONE now" (task 4.3) — so the round trip is byte-identical.
    expect(root.querySelector('[data-cg-element-id="inst-six"]')?.innerHTML).toBe(sixBefore);
  });

  it('an UNKNOWN look id returns false and changes nothing', () => {
    const { runtime, root } = boot();
    const before = holes(root);
    expect(runtime.setActiveLook('look-nope')).toBe(false);
    expect(runtime.activeLookId()).toBe('look-six');
    expect(holes(root)).toEqual(before);
  });

  it('a scene with NO multi-frame group: setActiveLook is a refused no-op, activeLookId undefined', () => {
    const bare = scene();
    delete (bare as unknown as Record<string, unknown>)['lookGroups'];
    const { runtime } = boot(bare);
    expect(runtime.activeLookId()).toBeUndefined();
    expect(runtime.setActiveLook('look-six')).toBe(false);
  });
});

describe('🔴 D.4 axes — the SAME source, one axis at a time (vs the 6-box cell 1)', () => {
  const cell1 = { x: 0, y: 0, w: 640, h: 540 };

  it('MOVED only — position changes, size does not', () => {
    const { runtime, root } = boot();
    runtime.setActiveLook('look-pair');
    const [hole] = holes(root);
    expect(hole).toEqual({ x: 640, y: 0, w: 640, h: 540 });
    expect({ w: hole?.w, h: hole?.h }).toEqual({ w: cell1.w, h: cell1.h });
  });

  it('RESIZED only — size changes, position does not', () => {
    const { runtime, root } = boot();
    runtime.setActiveLook('look-big');
    const [hole] = holes(root);
    expect(hole).toEqual({ x: 0, y: 0, w: 1280, h: 1080 });
    expect({ x: hole?.x, y: hole?.y }).toEqual({ x: cell1.x, y: cell1.y });
  });

  it('BOTH — position and size change together', () => {
    const { runtime, root } = boot();
    runtime.setActiveLook('look-solo');
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
  });
});
