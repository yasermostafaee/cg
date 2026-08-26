/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene, Transform } from '@cg/shared-schema';
import { Gizmo } from '../src/renderer/features/canvas/Gizmo.js';
import { effectiveAspect } from '../src/renderer/features/inspector/aspect-presets.js';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

/**
 * ⭐ **`B-181` — RESIZE SNAPPING IS COMPUTED ON THE POINTER, NOT ON THE BOX EDGE.**
 *
 * ── WHY THIS FILE MOUNTS THE COMPONENT ──────────────────────────────────────
 *
 * The defect is not in `computeRectResize`, which is correct and thoroughly covered by
 * `aspect-lock.test.ts`. It is in WHICH COORDINATE the gesture hands to `snapValue`. A unit
 * test that composes the helpers the way the fixed gizmo composes them would be asserting the
 * fix's own arithmetic and **would pass against the broken tree** — the same trap
 * `arrangement-gizmo-read.dom.test.ts` records for `B-175`. So the gesture is DRIVEN: press a
 * handle, move the pointer, read what was committed and what guide was published.
 *
 * ── 🔴 THE FIXTURE IS A **CORNER**, AND THAT WAS MEASURED, NOT ASSUMED ───────
 *
 * The obvious fixture — an aspect-locked EDGE handle — **cannot see this bug.** `lockExtents`
 * passes an edge handle's driven extent through unchanged (`lw = w`, `lh = w / lockRatio`), so
 * the driven edge still lands exactly under the pointer and snapping one IS snapping the other.
 * Measured, at `t = (100,100,640,360)`, lock 16:9, handle `r`, pointer x ∈ {900, 1000, 300}:
 * the committed right edge came back **900, 1000, 300** — the pointer, to the digit.
 *
 * A **corner** is where they part, because `lockExtents` PROJECTS `(rawW, rawH)` onto the
 * locked diagonal. Same box, handle `br`, pointer `(900, 300)` ⇒ the moving corner lands at
 * **(793.18, 489.91)** — 106.8 px away in `x` and 189.9 px in `y`. Snapping the pointer to a
 * target there moves the box nowhere near it, and the old code then drew a guide at the
 * pointer's target: **the canvas announced a snap the geometry had refused.**
 *
 * (The owner's other symptom — *"the mouse pointer drifts away from the box"* — is real for
 * edge handles too, because the DERIVED axis moves the handle's midpoint out from under the
 * cursor. That is inherent to the lock and is not what these tests are about.)
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/**
 * The NEIGHBOUR whose LEFT edge is the target the plate is dragged flush against.
 *
 * `1000` is chosen so it is not a round multiple of anything the plate's own geometry
 * produces: an implementation that happened to land on a canvas-derived number would pass a
 * test that snapped to 960 (the frame centre) for the wrong reason.
 */
const NEIGHBOUR_LEFT = 1000;

/** A 16:9 plate at (100, 100), 640×360 — the measured fixture from the docstring. */
const PLATE = () =>
  el('video-placeholder', 'plate', box(100, 100, 640, 360), {
    routeKey: 'guest-1',
    expectedAspect: 16 / 9,
  });

/**
 * ⚠ The composition is declared EXPLICITLY rather than left as top-level `layers`.
 * `setScene` migrates a bare-layer scene into an auto-generated composition whose id carries a
 * timestamp, which is neither addressable nor stable across runs.
 */
function seed(plate: Element = PLATE()): void {
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
      compositions: [
        {
          id: 'comp-main',
          name: 'Main',
          resolution: { width: 1920, height: 1080 },
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
                plate,
                el('video-placeholder', 'nbr', box(NEIGHBOUR_LEFT, 100, 500, 281.25), {
                  routeKey: 'guest-2',
                  expectedAspect: 16 / 9,
                }),
              ],
            },
          ],
          fields: [],
          bindings: [],
        },
      ],
      fonts: [],
      fields: [],
      bindings: [],
    } as unknown as Scene,
    null,
  );
  designerStore.setActiveComposition('comp-main');
}

/** The active composition projected onto a Scene — what the canvas and the preflight see. */
function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function elementById(id: string): Element {
  const found = projected()
    .layers.flatMap((l) => l.children)
    .find((e) => e.id === id);
  if (found === undefined) throw new Error(`no element ${id}`);
  return found;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Mount the gizmo for `id` at zoom 1 — overlay coords ARE scene coords there. */
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

/** jsdom has no `PointerEvent`; React and the window listeners both read a MouseEvent fine. */
function pointer(type: string, clientX: number, clientY: number, shift = false): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
    shiftKey: shift,
  });
}

const CORNER_ORDER = ['tl', 'tr', 'bl', 'br'] as const;
/** Edge strips render in this order — see `edges` in `Gizmo.tsx`. */
const EDGE_ORDER = ['t', 'r', 'b', 'l'] as const;

/** Guides published DURING the move, snapshotted before pointer-up clears them. */
interface DragResult {
  readonly guides: { x: readonly number[]; y: readonly number[] };
}

/**
 * Press `handle`, move the pointer TO an absolute scene point, release.
 *
 * ⚠ **The guides are snapshotted between the move and the up**, because `onUp` calls
 * `setSnapGuides({x: [], y: []})` — reading them after release always yields `[]` and every
 * guide assertion would pass vacuously against any implementation.
 */
function dragHandleTo(
  host: HTMLElement,
  handle: (typeof CORNER_ORDER)[number] | (typeof EDGE_ORDER)[number],
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { shift?: boolean } = {},
): DragResult {
  const isCorner = (CORNER_ORDER as readonly string[]).includes(handle);
  const hits = host.querySelectorAll(isCorner ? '.cg-gizmo-corner' : '.cg-gizmo-edge');
  const idx = isCorner
    ? CORNER_ORDER.indexOf(handle as (typeof CORNER_ORDER)[number])
    : EDGE_ORDER.indexOf(handle as (typeof EDGE_ORDER)[number]);
  const hit = hits[idx];
  if (hit === undefined) throw new Error(`no ${handle} handle rendered`);
  const shift = opts.shift === true;
  act(() => {
    hit.dispatchEvent(pointer('pointerdown', from.x, from.y, shift));
  });
  act(() => {
    window.dispatchEvent(pointer('pointermove', to.x, to.y, shift));
  });
  const live = designerStore.get().snapGuides;
  const snapshot = { x: [...live.x], y: [...live.y] };
  act(() => {
    window.dispatchEvent(pointer('pointerup', to.x, to.y, shift));
  });
  return { guides: snapshot };
}

/** The committed transform of `id`, straight out of the store. */
function committed(id: string): { x: number; y: number; w: number; h: number } {
  const t = elementById(id).transform;
  return { x: t.position.x, y: t.position.y, w: t.size.w, h: t.size.h };
}

beforeEach(() => {
  seed();
  designerStore.setAspectLock(true);
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

/**
 * 🔴 **THE DISCRIMINATING POINTER, and it was found by measurement, not by choosing a
 * round number.**
 *
 * `br` grabbed at the plate's own bottom-right `(740, 460)` and moved to `(1000, 597)`:
 *
 * - the POINTER's `x` is **exactly `NEIGHBOUR_LEFT`** — zero distance from the target;
 * - the locked corner lands at **`(996.047…, 604.027…)`** — **3.95 px short**, inside the
 *   7 px threshold but nowhere near the line.
 *
 * So the OLD code snapped a pointer that was already on the target (a no-op), published a
 * guide at `1000`, and committed a box whose edge was at `996.047`. **The canvas drew a line
 * the box was not touching.** There is no fixture that separates the two implementations more
 * cleanly, and a rounder pointer does not separate them at all.
 */
const GRAB_BR = { x: 740, y: 460 } as const;
const AIM = { x: 1000, y: 597 } as const;
/** Where the locked corner lands with NO snap — measured, and the reason the snap is needed. */
const UNSNAPPED_X = 996.0474777448071;

describe('B-181 — an aspect-LOCKED corner snaps the BOX EDGE, not the pointer', () => {
  it('🔴 the fixture really does separate pointer from edge — the premise, asserted first', () => {
    /*
      Asserted before anything rests on it. If `lockExtents` ever stopped diverging here, every
      test below would pass for the wrong reason and nothing would be testing the fix — which is
      exactly how an aspect-locked EDGE handle (which does NOT diverge) would have fooled us.
    */
    designerStore.setAspectLock(true);
    const host = mountGizmo('plate');
    // Shift bypasses the snap, so this is the raw locked solve at the same pointer.
    dragHandleTo(host, 'br', GRAB_BR, AIM, { shift: true });
    const c = committed('plate');
    expect(c.x + c.w).toBe(UNSNAPPED_X);
    // The pointer was ON the target while the box was ~4 px away — inside the 7 px threshold.
    expect(NEIGHBOUR_LEFT - (c.x + c.w)).toBeCloseTo(3.9525, 4);
    expect(AIM.x).toBe(NEIGHBOUR_LEFT);
  });

  it('🔴 the committed right edge lands EXACTLY on the neighbour, and the guide says so', () => {
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'br', GRAB_BR, AIM);

    const c = committed('plate');
    // 🔴 BY VALUE: the right edge IS the target, not merely close to it.
    expect(c.x + c.w).toBe(NEIGHBOUR_LEFT);
    // …and the guide the canvas drew is that same coordinate. It is measured off the committed
    // rect, so it can no longer announce a snap the box did not take.
    expect(guides.x).toEqual([NEIGHBOUR_LEFT]);
    // The lock is still satisfied — flushness must not be bought by deforming the plate.
    expect(effectiveAspect({ ...elementById('plate').transform } as never)).toBeCloseTo(16 / 9, 9);
    // The fixed corner (tl) never moved — `B-175`'s pin survives the extra re-solve.
    expect({ x: c.x, y: c.y }).toEqual({ x: 100, y: 100 });
  });

  it('🔴 …and the resulting scene has NO overlap error — the rule and the gesture together', () => {
    /*
      The brief's "rule and gesture in ONE test for the SAME fixture". Flush abutment is only
      worth anything if `D-137`'s overlap rule then accepts it: a gesture that landed the edge
      one ULP PAST the target would satisfy the assertion above and still kill the Export.
      `B-180`'s guard covers the dust; this covers the gesture that has to produce it.
    */
    const host = mountGizmo('plate');
    dragHandleTo(host, 'br', GRAB_BR, AIM);

    expect(committed('plate').x + committed('plate').w).toBe(NEIGHBOUR_LEFT); // really flush …
    const overlaps = liveSourceIssues(projected()).filter((i) => i.code === 'live-source-overlap');
    expect(overlaps).toEqual([]); // … and the rule accepts it.
  });

  it('at 100 % zoom, in one drag, without leaving the frame — the owner’s second report', () => {
    // "Making the boxes touch each other is very hard — you have to zoom in a lot so the edges
    // do not overlap or leave the frame." The gizmo is mounted at `scale: 1`, so this whole
    // file IS the no-zoom case; asserted rather than implied.
    const host = mountGizmo('plate');
    dragHandleTo(host, 'br', GRAB_BR, AIM);
    const c = committed('plate');
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1920);
    expect(c.y + c.h).toBeLessThanOrEqual(1080);
  });
});

describe('B-181 task 3 — which axis leads when a locked corner could snap on either', () => {
  /*
    🔴 **THE DECISION, PINNED BY VALUE IN BOTH DIRECTIONS.** Under a lock the two extents are
    tied, so a corner can satisfy at most one target. The rule is **nearest wins, `x` on a tie**
    (`chooseEdgeSnap`), and the two tests below differ ONLY in where the competing `y` target
    sits — so together they prove the comparison is real rather than a hard-coded axis.

    A ruler guide supplies the `y` contender: at the measured landing point `(996.047, 604.027)`
    the natural `y` targets (the frame's 540, the neighbour's 100 / 240.625 / 381.25) are all
    tens of pixels away, so without one there is no contest to decide.
  */
  it('🔴 X wins when the x target is nearer — 3.953 px vs 4.027 px', () => {
    designerStore.addGuide('y', 600); // |604.027 − 600| = 4.027 … just LOSES to x's 3.953
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'br', GRAB_BR, AIM);
    expect(guides.x).toEqual([NEIGHBOUR_LEFT]);
    // 🔴 The FORCED axis gets NO guide. It did not snap; it was derived. Drawing a line for a
    // merely-nearby forced axis would be the very lie this item is about.
    expect(guides.y).toEqual([]);
    expect(committed('plate').x + committed('plate').w).toBe(NEIGHBOUR_LEFT);
  });

  it('🔴 …and Y wins when the y target is nearer — same drag, guide moved 5 px', () => {
    designerStore.addGuide('y', 605); // |604.027 − 605| = 0.973 … now BEATS x's 3.953
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'br', GRAB_BR, AIM);
    expect(guides.y).toEqual([605]);
    expect(guides.x).toEqual([]);
    const c = committed('plate');
    // The bottom edge is exactly on the guide …
    expect(c.y + c.h).toBe(605);
    // … and the right edge is NOT on its target, because the lock forced it. This is the
    // consequence the decision buys, stated as an assertion rather than left implicit.
    expect(c.x + c.w).not.toBe(NEIGHBOUR_LEFT);
  });

  it('a corner far from every target snaps nothing and draws nothing', () => {
    /*
      The control that stops the assertions above passing because a guide is always emitted.

      ⚠ The pointer is `(700, 437.5)` — ON the locked diagonal, so the corner lands at
      `(700, 437.5)` too, which is ≥ 56 px from every target in this fixture. The first attempt
      used `(1500, 300)` and FAILED with a guide at `1250`: 1500 is the neighbour's right edge
      and 1250 its centre, so "far away" has to be checked against the target list rather than
      eyeballed.
    */
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'br', GRAB_BR, { x: 700, y: 437.5 });
    expect(guides.x).toEqual([]);
    expect(guides.y).toEqual([]);
  });
});

describe('B-181 — the UNLOCKED path is the positive control and must not move', () => {
  it('🔴 an unlocked corner still puts the edge on the target, exactly as before', () => {
    /*
      The path that already worked, and the reason this bug went unseen for so long: unlocked,
      `computeRectResize` puts the grabbed edge AT the pointer, so `movingEdge.x === pointer.x`
      identically — the element's own `scale` cancels out of the algebra. Snapping either one
      gives the same answer, and `pointerForMovingEdge` provably returns the target itself.
    */
    designerStore.setAspectLock(false);
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'br', GRAB_BR, { x: 1003, y: 700 });
    const c = committed('plate');
    expect(c.x + c.w).toBe(NEIGHBOUR_LEFT);
    expect(guides.x).toEqual([NEIGHBOUR_LEFT]);
    // Unlocked, the un-snapped axis is free — and `B-180` quantises it to a whole pixel.
    expect(c.y + c.h).toBe(700);
  });

  it('an unlocked EDGE handle is unchanged too — one axis driven, the other untouched', () => {
    designerStore.setAspectLock(false);
    const host = mountGizmo('plate');
    // The `r` strip's midpoint is (740, 280).
    const { guides } = dragHandleTo(host, 'r', { x: 740, y: 280 }, { x: 1004, y: 280 });
    const c = committed('plate');
    expect(c.x + c.w).toBe(NEIGHBOUR_LEFT);
    expect(c.h).toBe(360); // the derived axis is not driven by this handle
    expect(guides.x).toEqual([NEIGHBOUR_LEFT]);
  });

  it('🔴 a LOCKED edge handle also lands exactly — it always did, and it still does', () => {
    /*
      Recorded because it is the fixture that CANNOT see this bug, and someone will reach for it
      first. `lockExtents` passes an edge handle's driven extent through unchanged (`lw = w`),
      so the right edge was already exactly under the pointer before this change. The assertion
      proves the fix did not disturb the case that was already correct — and the derived height
      moving with it is the lock working, not a regression.
    */
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'r', { x: 740, y: 280 }, { x: 1004, y: 280 });
    const c = committed('plate');
    expect(c.x + c.w).toBe(NEIGHBOUR_LEFT);
    expect(c.w).toBe(900);
    expect(c.h).toBe(506.25); // 900 ÷ (16/9) — derived, and deliberately fractional
    expect(guides.x).toEqual([NEIGHBOUR_LEFT]);
  });
});

describe('B-181 — Shift still bypasses everything', () => {
  it('Shift held: no snap, no guide, free placement — exactly as today', () => {
    const host = mountGizmo('plate');
    const { guides } = dragHandleTo(host, 'br', GRAB_BR, AIM, { shift: true });
    const c = committed('plate');
    // Not pulled onto the neighbour …
    expect(c.x + c.w).toBe(UNSNAPPED_X);
    // … and nothing drawn.
    expect(guides.x).toEqual([]);
    expect(guides.y).toEqual([]);
    // Shift bypasses `B-180`'s quantise too, so the free resize keeps its fraction.
    expect(Number.isInteger(c.w) && Number.isInteger(c.h)).toBe(false);
  });
});
