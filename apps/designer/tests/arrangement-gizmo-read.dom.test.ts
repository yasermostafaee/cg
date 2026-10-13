/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene, Transform } from '@cg/shared-schema';
import { Gizmo } from '../src/renderer/features/canvas/Gizmo.js';
import { localToScene } from '../src/renderer/features/canvas/geometry.js';
import { effectiveAspect } from '../src/renderer/features/inspector/aspect-presets.js';
import {
  activeCellFor,
  hasNoActiveCell,
  renderedTransformAt,
} from '../src/renderer/state/slices/arrangements.js';
import { designerStore } from '../src/renderer/state/store.js';

/**
 * 🔴 **`B-175` — THE GIZMO DRAWS FROM ONE RECT AND COMPUTES AGAINST ANOTHER.**
 *
 * ── WHY THIS FILE MOUNTS THE COMPONENT INSTEAD OF UNIT-TESTING THE MATH ──────
 *
 * The defect is not in `computeRectResize`, which is correct and already covered. It is in
 * WHICH TRANSFORM the gesture hands it. A unit test that calls `computeRectResize` with the
 * right rect asserts the fix's own arithmetic and would pass against the broken tree, because
 * the broken tree's arithmetic was never wrong. So the gesture has to be DRIVEN — press a
 * handle, move the pointer, read what was committed.
 *
 * That is also what makes the two halves comparable in one test: the DRAWN rect is readable
 * from the `gizmo-frame` polygon's own points, and the COMPUTED rect is readable from what
 * the drag committed. `B-175` is precisely the claim that those two disagree.
 *
 * ── 🔴 THE DISCRIMINATING FIXTURE, AND WHY A LAZIER ONE PROVES NOTHING ───────
 *
 * `inst` is authored at `(0, 0, 1920, 1080)` and its cell is `(400, 200, 800, 300)` — it
 * differs in POSITION and in SIZE, on BOTH axes. Every one of those four differences is
 * load-bearing:
 *
 *   - a cell at the authored POSITION hides a wrong `fixedScene` and a wrong `grabScene`;
 *   - a cell at the authored SIZE hides wrong `ratioW`/`ratioH`;
 *   - a cell differing on ONE axis only lets an implementation that fixed x and forgot y
 *     pass — this repo's one-axis blindness, the same axis `B-149` was missing.
 *
 * A fixture whose cell equals its authored rect makes the two rects identical and the defect
 * invisible: every assertion below would pass against the broken tree.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CELL = { x: 400, y: 200, width: 800, height: 300 } as const;
const AUTHORED = { x: 0, y: 0, w: 1920, h: 1080 } as const;

const box = (x: number, y: number, w: number, h: number, over: Partial<Transform> = {}) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
  ...over,
});
const base = { opacity: 1, visible: true, locked: false };
const el = (type: string, id: string, t: ReturnType<typeof box>, over = {}): Element =>
  ({ ...base, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

/** The box composition — one plate filling it, so the plate's aspect is the box's. */
const BOX_COMP = {
  id: 'comp-box',
  name: 'box',
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: 'bl',
      name: 'l',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        el('video-placeholder', 'plate', box(0, 0, 1920, 1080), {
          routeKey: 'guest-1',
          expectedAspect: 16 / 9,
        }),
      ],
    },
  ],
  fields: [],
  bindings: [],
};

function main(instTransform: ReturnType<typeof box>) {
  return {
    id: 'comp-main',
    name: 'Main',
    resolution: { width: 1920, height: 1080 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'ml',
        name: 'l',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          el('composition', 'inst', instTransform, { compositionId: 'comp-box' }),
          el('composition', 'inst-2', box(0, 0, 1920, 1080), { compositionId: 'comp-box' }),
        ],
      },
    ],
    fields: [],
    bindings: [],
    arrangements: [
      {
        id: 'two',
        name: 'two',
        cells: [{ ...CELL }, { x: 1200, y: 200, width: 600, height: 300 }],
        isDefault: true,
        transition: { mode: 'cut' },
      },
      // One cell only — `inst-2` is the NO-CELL box the A2 refusal is about.
      {
        id: 'one',
        name: 'one',
        cells: [{ ...CELL }],
        isDefault: false,
        transition: { mode: 'cut' },
      },
    ],
  };
}

function seed(instTransform = box(AUTHORED.x, AUTHORED.y, AUTHORED.w, AUTHORED.h)): void {
  designerStore.setScene(
    {
      schemaVersion: 1,
      id: 'proj',
      name: 'proj',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [],
      compositions: [BOX_COMP, main(instTransform)],
      fonts: [],
      fields: [],
      bindings: [],
    } as unknown as Scene,
    null,
  );
  designerStore.setActiveComposition('comp-main');
  designerStore.setActiveArrangement('two');
}

function elementById(id: string): Element {
  const scene = designerStore.get().scene;
  const comp = (scene?.compositions ?? []).find((c) => c.id === 'comp-main');
  const found = (comp?.layers ?? []).flatMap((l) => l.children).find((e) => e.id === id);
  if (found === undefined) throw new Error(`no element ${id}`);
  return found;
}

function cellsOf(arrangementId: string): readonly {
  x: number;
  y: number;
  width: number;
  height: number;
}[] {
  const scene = designerStore.get().scene;
  const comp = (scene?.compositions ?? []).find((c) => c.id === 'comp-main');
  return (comp?.arrangements ?? []).find((a) => a.id === arrangementId)?.cells ?? [];
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Mount the gizmo for `id` at zoom 1 and return the container. */
function mountGizmo(id: string): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  act(() => {
    r.render(createElement(Gizmo, { element: elementById(id), scale: 1, currentFrame: 0 }));
  });
  return container;
}

/**
 * The rect the gizmo actually DREW, read back off its own frame polygon.
 *
 * At zoom 1 with no stage origin the overlay coords ARE scene coords, so this is directly
 * comparable to what the gesture commits. Read from the polygon rather than recomputed,
 * because a recomputation would be the same expression the component uses and could not
 * disagree with it.
 */
function drawnRect(host: HTMLElement): { x: number; y: number; width: number; height: number } {
  const poly = host.querySelector('[data-testid="gizmo-frame"]');
  const pts = (poly?.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number));
  const xs = pts.map((p) => p[0] ?? NaN);
  const ys = pts.map((p) => p[1] ?? NaN);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * jsdom has no `PointerEvent`, and React reads `clientX`/`clientY` straight off the native
 * event — so a bubbling `MouseEvent` named `pointerdown` is what a real press delivers to
 * both React's root listener and the `window` listeners `beginResize` attaches.
 */
function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

/** Press the nth corner hit (tl, tr, bl, br), drag by (dx, dy) scene px at zoom 1, release. */
function dragCorner(
  host: HTMLElement,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  from: { x: number; y: number },
  dx: number,
  dy: number,
): void {
  const order = ['tl', 'tr', 'bl', 'br'] as const;
  const hits = host.querySelectorAll('.cg-gizmo-corner');
  const hit = hits[order.indexOf(corner)];
  if (hit === undefined) throw new Error('no corner hit rendered');
  act(() => {
    hit.dispatchEvent(pointer('pointerdown', from.x, from.y));
  });
  act(() => {
    window.dispatchEvent(pointer('pointermove', from.x + dx, from.y + dy));
  });
  act(() => {
    window.dispatchEvent(pointer('pointerup', from.x + dx, from.y + dy));
  });
}

beforeEach(() => {
  seed();
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

describe('B-175 — the ONE read side', () => {
  it('🔴 renderedTransformAt answers the CELL for a box — position AND size, both axes', () => {
    const t = renderedTransformAt(elementById('inst'), 0);
    expect({ x: t.position.x, y: t.position.y, w: t.size.w, h: t.size.h }).toEqual({
      x: CELL.x,
      y: CELL.y,
      w: CELL.width,
      h: CELL.height,
    });
    // The fixture is only discriminating if it actually differs on all four.
    expect(t.position.x).not.toBe(AUTHORED.x);
    expect(t.position.y).not.toBe(AUTHORED.y);
    expect(t.size.w).not.toBe(AUTHORED.w);
    expect(t.size.h).not.toBe(AUTHORED.h);
  });

  it('the gizmo DRAWS the cell', () => {
    const host = mountGizmo('inst');
    expect(drawnRect(host)).toEqual({
      x: CELL.x,
      y: CELL.y,
      width: CELL.width,
      height: CELL.height,
    });
  });

  it('🔴 the rect the gizmo DRAWS is the rect the RESIZE computes against', () => {
    const host = mountGizmo('inst');
    const drawn = drawnRect(host);
    // Grab the drawn bottom-right and pull it +100/+50. Against the CELL that is a
    // 900×300+50 box at the unchanged origin; against the AUTHORED rect it is 2020×1130.
    dragCorner(host, 'br', { x: drawn.x + drawn.width, y: drawn.y + drawn.height }, 100, 50);
    expect(cellsOf('two')[0]).toEqual({
      x: CELL.x,
      y: CELL.y,
      width: CELL.width + 100,
      height: CELL.height + 50,
    });
  });

  it('🔴 the authored transform is NOT touched — the write still lands on the cell', () => {
    const host = mountGizmo('inst');
    const drawn = drawnRect(host);
    dragCorner(host, 'br', { x: drawn.x + drawn.width, y: drawn.y + drawn.height }, 100, 50);
    const t = elementById('inst').transform;
    expect({ x: t.position.x, y: t.position.y, w: t.size.w, h: t.size.h }).toEqual({
      x: AUTHORED.x,
      y: AUTHORED.y,
      w: AUTHORED.w,
      h: AUTHORED.h,
    });
    // …and no OTHER arrangement moved (D-154's own rule, still true through this change).
    expect(cellsOf('one')[0]).toEqual({ ...CELL });
  });
});

describe('B-175 — the fixed corner, on an ARRANGED box', () => {
  /**
   * 🔴 Rotation AND non-uniform scale together, because they fail differently: rotation
   * makes `fixedScene` depend on the SIZE through the anchor offset, and a non-uniform
   * scale makes the two axes' errors differ. A test at rotation 0 / scale 1 cannot separate
   * the drawn rect from the authored one at all once the position matches.
   */
  it('🔴 stays put under rotation AND non-uniform scale', () => {
    seed(
      box(AUTHORED.x, AUTHORED.y, AUTHORED.w, AUTHORED.h, {
        rotation: 30,
        scale: { x: 2, y: 0.5 },
        anchor: { x: 0.5, y: 0.5 },
      }),
    );
    const before = renderedTransformAt(elementById('inst'), 0);
    // `br` is grabbed, so `tl` is the corner that must not move.
    const fixedBefore = localToScene(before, 0, 0);
    const host = mountGizmo('inst');
    const drawn = drawnRect(host);
    dragCorner(host, 'br', { x: drawn.x + drawn.width, y: drawn.y + drawn.height }, 120, -40);
    const after = renderedTransformAt(elementById('inst'), 0);
    const fixedAfter = localToScene(after, 0, 0);
    expect(fixedAfter.x).toBeCloseTo(fixedBefore.x, 6);
    expect(fixedAfter.y).toBeCloseTo(fixedBefore.y, 6);
    // The gesture did something — otherwise "unchanged" would be trivially true.
    expect(after.size.w).not.toBeCloseTo(before.size.w, 6);
  });
});

describe('B-175 — beginRotate pivots about the DRAWN box', () => {
  it('🔴 the swept angle is measured about the cell centre, not the authored centre', () => {
    seed(box(AUTHORED.x, AUTHORED.y, AUTHORED.w, AUTHORED.h, { anchor: { x: 0.5, y: 0.5 } }));
    const host = mountGizmo('inst');
    const drawn = drawnRect(host);
    const grab = { x: drawn.x + drawn.width, y: drawn.y + drawn.height };
    const to = { x: drawn.x, y: drawn.y - 400 };
    // The pivot the FIX produces: the anchor of the DRAWN box.
    const pivot = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 };
    const deg = (p: { x: number; y: number }): number =>
      (Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180) / Math.PI;
    const expected = Number((deg(to) - deg(grab)).toFixed(2));

    const order = ['tl', 'tr', 'bl', 'br'] as const;
    const zone = host.querySelectorAll('.cg-gizmo-rot-zone, [class*="rotZone"]')[
      order.indexOf('br')
    ];
    if (zone === undefined) throw new Error('no rotate zone rendered');
    act(() => {
      zone.dispatchEvent(pointer('pointerdown', grab.x, grab.y));
    });
    // Shift held: snapping off, so the committed angle is the raw swept angle.
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          clientX: to.x,
          clientY: to.y,
          shiftKey: true,
        }),
      );
    });
    act(() => {
      window.dispatchEvent(pointer('pointerup', to.x, to.y));
    });

    expect(elementById('inst').transform.rotation).toBeCloseTo(expected, 1);
    // Against the AUTHORED centre (960, 540) the swept angle is a different number; if the
    // two ever coincide the fixture has stopped discriminating.
    const authoredPivot = { x: AUTHORED.w / 2, y: AUTHORED.h / 2 };
    const degA = (p: { x: number; y: number }): number =>
      (Math.atan2(p.y - authoredPivot.y, p.x - authoredPivot.x) * 180) / Math.PI;
    expect(Number((degA(to) - degA(grab)).toFixed(2))).not.toBeCloseTo(expected, 1);
  });
});

describe('B-175 / A2 — a box with NO CELL', () => {
  beforeEach(() => {
    designerStore.setActiveArrangement('one');
  });

  it('is reported by the ONE predicate, and only for that case', () => {
    expect(hasNoActiveCell('inst-2')).toBe(true);
    // A box WITH a cell, and a box under no arrangement at all, both own their geometry.
    expect(hasNoActiveCell('inst')).toBe(false);
    designerStore.setActiveArrangement(null);
    expect(hasNoActiveCell('inst-2')).toBe(false);
  });

  /**
   * ⚠ **This one is DEFENCE IN DEPTH and says so, because it does NOT go red on revert.**
   *
   * Measured while proving the rest of this file red: with the guard removed the gesture
   * still commits nothing, and it is worth writing down exactly why so nobody mistakes that
   * for the guard being pointless — or for the guard being the thing that stops it.
   *
   * `computeRectResize` divides by `Math.max(rect.w, 1e-6)`, so a `NO_CELL` start rect really
   * does produce a ratio of about **four million**. What saves it is a second coincidence:
   * `sizeNew = size.w × ratioW` is `0 × 4e6 = 0`, every corner of a zero-sized rect is the
   * same point so the position solve stays finite, and `commitToActiveCell` then refuses the
   * zeros because `isNoCell` is true. **Two multiplications by zero and a downstream refusal**
   * — none of which is a statement that this gesture should not have started.
   *
   * So this asserts the OBSERVABLE difference the guard makes, which is real: the gesture
   * does not engage at all. No cursor lock is installed over the whole document, and no undo
   * step is created for a drag that could never do anything.
   */
  it('refuses the gesture at the door — no cursor lock, no undo step, nothing committed', () => {
    const cellsBefore = JSON.stringify(cellsOf('one'));
    const authoredBefore = JSON.stringify(elementById('inst-2').transform);
    const stylesBefore = document.head.querySelectorAll('style').length;
    const host = mountGizmo('inst-2');
    const order = ['tl', 'tr', 'bl', 'br'] as const;
    const hit = host.querySelectorAll('.cg-gizmo-corner')[order.indexOf('br')];
    if (hit === undefined) throw new Error('no corner hit rendered');
    act(() => {
      hit.dispatchEvent(pointer('pointerdown', 0, 0));
    });
    // MID-GESTURE: `lockCursor` appends a `* { cursor: … !important }` sheet for the whole
    // drag. Its ABSENCE here is the guard working; it is removed on pointerup either way,
    // so this is the only moment the difference is visible.
    expect(document.head.querySelectorAll('style').length).toBe(stylesBefore);
    act(() => {
      window.dispatchEvent(pointer('pointermove', 500, 400));
    });
    act(() => {
      window.dispatchEvent(pointer('pointerup', 500, 400));
    });
    expect(JSON.stringify(cellsOf('one'))).toBe(cellsBefore);
    expect(JSON.stringify(elementById('inst-2').transform)).toBe(authoredBefore);
  });
});

/**
 * `D-155` — the aspect lock's PRECONDITION, which is what this fix buys it.
 *
 * ⚠ The lock itself is NOT implemented (`D-155` is `[ ]`), so "drag a locked plate and watch
 * the aspect hold" cannot be written yet and is not faked here. What CAN be asserted — and is
 * the thing the lock will stand on — is that the rect it will constrain is the rect on screen.
 */
describe('D-155 precondition — the aspect the lock will constrain is the DRAWN one', () => {
  it('🔴 the effective aspect of the computed rect is the effective aspect of the drawn rect', () => {
    const host = mountGizmo('inst');
    const drawn = drawnRect(host);
    const computed = renderedTransformAt(elementById('inst'), 0);
    expect(effectiveAspect(computed)).toBeCloseTo(drawn.width / drawn.height, 9);
    // The authored rect is 16:9; the cell is not. Before this fix the lock would have held
    // the plate at 1.78 while the box on screen was 2.67 — the wrong rect, silently.
    expect(effectiveAspect(computed)).not.toBeCloseTo(AUTHORED.w / AUTHORED.h, 3);
  });

  /**
   * 🔴 **A CORRECTION, pinned so it is not re-derived.** `B-175` was filed claiming
   * `AspectRow` shares this defect because it reads `element.transform`. It does NOT:
   * `activeCellFor` resolves through `boxInstanceIds`, which filters `type === 'composition'`,
   * and `expectedAspect` lives on a `video-placeholder`. **A plate can never have a cell**, so
   * the authored transform IS its rendered transform and `AspectRow` was right all along.
   * A plate is also static and axis-aligned (`D-137`), so there is no keyframe to interpolate
   * either. Changing `AspectRow` to read the cell would fit against a rect that does not exist.
   */
  it('🔴 a PLATE never has a cell, so its authored transform IS its rendered one', () => {
    designerStore.setActiveComposition('comp-box');
    designerStore.setActiveArrangement('two');
    const scene = designerStore.get().scene;
    expect(activeCellFor(scene, 'plate')).toBeNull();
    const comp = (scene?.compositions ?? []).find((c) => c.id === 'comp-box');
    const plate = (comp?.layers ?? []).flatMap((l) => l.children).find((e) => e.id === 'plate');
    if (plate === undefined) throw new Error('no plate');
    expect(renderedTransformAt(plate, 0)).toEqual(plate.transform);
  });
});
