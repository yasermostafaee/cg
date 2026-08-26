import { describe, expect, it } from 'vitest';
import {
  boxRect,
  chooseEdgeSnap,
  computeRectResize,
  movingCornerScene,
  pointerForMovingEdge,
  rectCorner,
  resizeMovingCorner,
  type BoxTransform,
} from '../src/renderer/features/canvas/geometry.js';

/**
 * ⭐ **`B-181` — the EDGE-SPACE snap helpers, unit-tested beside the solver they wrap.**
 *
 * They exist so the gizmo can snap the BOX EDGE instead of the pointer **without opening a
 * second solver**: `movingCornerScene` reads the edge off a rect `computeRectResize` produced,
 * and `pointerForMovingEdge` inverts it — *"which pointer would have produced the rect I
 * want"* — so the answer goes back through the same solver and every invariant it holds (the
 * `B-175` fixed-corner pin, the `MIN_SIZE` clamp, the `D-155` lock) keeps working untouched.
 *
 * The gesture itself is driven end to end in `resize-edge-snap.dom.test.ts`; this file pins
 * the algebra those tests rest on.
 */

const box = (over: Partial<BoxTransform> = {}): BoxTransform => ({
  position: { x: 100, y: 100 },
  size: { w: 640, h: 360 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  ...over,
});
const LOCK_16_9 = 16 / 9;

describe('B-181 — resizeMovingCorner', () => {
  it('is the corner diagonally opposite the fixed one', () => {
    expect(resizeMovingCorner('br')).toBe('br'); // pins tl
    expect(resizeMovingCorner('tl')).toBe('tl'); // pins br
    expect(resizeMovingCorner('tr')).toBe('tr');
    expect(resizeMovingCorner('bl')).toBe('bl');
  });

  it('for an EDGE handle it is a corner ON the moving edge', () => {
    // `r` pins `tl`, so the moving corner is `br` — whose `x` IS the right edge. That corner's
    // `y` is meaningless for this handle, and `cfg.freeH` is what tells the caller to ignore it.
    expect(resizeMovingCorner('r')).toBe('br');
    expect(resizeMovingCorner('l')).toBe('bl'); // pins tr ⇒ opposite is bl, whose x IS the left
    expect(resizeMovingCorner('b')).toBe('br'); // pins tl ⇒ br.y IS the bottom
    expect(resizeMovingCorner('t')).toBe('tr'); // pins bl ⇒ tr.y IS the top
  });

  it('🔴 the returned corner really does carry the DRIVEN edge, for every handle', () => {
    /*
      The assertion above is a table and could be wrong in the same direction as the code. This
      one checks the PROPERTY the table exists to satisfy — and it caught a wrong expectation
      when this file was written (`l` was asserted as `tl`, which is not the opposite of `tr`).
    */
    const r = { x: 10, y: 20, w: 100, h: 50 };
    const c = (h: Parameters<typeof resizeMovingCorner>[0]) => rectCorner(resizeMovingCorner(h), r);
    expect(c('r').x).toBe(r.x + r.w); // right
    expect(c('l').x).toBe(r.x); // left
    expect(c('b').y).toBe(r.y + r.h); // bottom
    expect(c('t').y).toBe(r.y); // top
  });
});

describe('B-181 — movingCornerScene', () => {
  it('🔴 UNLOCKED, the moving corner IS the pointer — the identity that hid this bug', () => {
    /*
      The whole reason the defect was invisible without an aspect lock: `computeRectResize` puts
      the grabbed corner exactly at the pointer, so snapping the pointer WAS snapping the edge.
      Asserted here because the fix's claim that it cannot disturb the unlocked path rests on it.
    */
    const t = box();
    for (const p of [
      { x: 900, y: 500 },
      { x: 1234.5, y: 777.25 },
      { x: 150, y: 140 },
    ]) {
      const solved = computeRectResize(t, boxRect(t), 'br', p);
      const edge = movingCornerScene(t, boxRect(t), 'br', solved);
      expect(edge.x).toBeCloseTo(p.x, 9);
      expect(edge.y).toBeCloseTo(p.y, 9);
    }
  });

  it('🔴 …and it still holds under a NON-UNIFORM element scale, where the algebra cancels', () => {
    // `rawW = |p.x − fixed.x| / scale.x`, and the edge is `fixed.x + scale.x · rawW`, so the
    // scale divides straight back out. A fixture at scale 1 could not tell a correct
    // implementation from one that had forgotten the scale entirely.
    const t = box({ scale: { x: 2, y: 0.5 } });
    const p = { x: 1400, y: 400 };
    const edge = movingCornerScene(t, boxRect(t), 'br', computeRectResize(t, boxRect(t), 'br', p));
    expect(edge.x).toBeCloseTo(1400, 9);
    expect(edge.y).toBeCloseTo(400, 9);
  });

  it('🔴 LOCKED at a CORNER it is NOT the pointer — the defect, by value', () => {
    // The measured divergence: the projection onto the locked diagonal moves the corner ~107 px
    // in x and ~190 px in y away from where the author is pointing.
    const t = box();
    const solved = computeRectResize(t, boxRect(t), 'br', { x: 900, y: 300 }, LOCK_16_9);
    const edge = movingCornerScene(t, boxRect(t), 'br', solved);
    expect(edge.x).toBeCloseTo(793.18, 2);
    expect(edge.y).toBeCloseTo(489.91, 2);
  });

  it('LOCKED at an EDGE handle it IS the pointer — the fixture that CANNOT see the bug', () => {
    // `lockExtents` passes an edge handle's driven extent straight through (`lw = w`), so that
    // edge never left the pointer. Recorded so nobody builds a discriminating fixture from one.
    const t = box();
    const solved = computeRectResize(t, boxRect(t), 'r', { x: 900, y: 300 }, LOCK_16_9);
    expect(movingCornerScene(t, boxRect(t), 'r', solved).x).toBeCloseTo(900, 9);
  });
});

describe('B-181 — pointerForMovingEdge (the inverse)', () => {
  const t = box();
  const rect = boxRect(t);

  it('🔴 UNLOCKED it returns the target itself — so the unlocked path cannot move', () => {
    // `pointer.x = fixed.x + sgn·wNew·scale.x` with `wNew = (T − fixed.x)/(scale.x·sgn)`
    // collapses to `T`. That identity is the guarantee that this change is invisible to every
    // element kind with no aspect to lock.
    const p = pointerForMovingEdge(t, rect, 'br', 'x', 1000, { x: 900, y: 500 });
    expect(p?.x).toBe(1000);
    expect(p?.y).toBe(500); // the other axis stays exactly where the author is holding it
  });

  it('🔴 LOCKED at a corner it aims at the point ON the locked diagonal', () => {
    // `(wNew, wNew / lockRatio)` from the fixed corner — both the nearest pointer that produces
    // the wanted extent and the corner of the very rect being committed, so the cursor ends up
    // back on the handle instead of drifting further off it.
    const p = pointerForMovingEdge(t, rect, 'br', 'x', 1000, { x: 900, y: 500 }, LOCK_16_9);
    expect(p?.x).toBe(1000); // fixed.x 100 + extent 900
    expect(p?.y).toBeCloseTo(100 + 900 / LOCK_16_9, 9);
  });

  it('🔴 …and feeding that back through the solver lands the edge ON the target', () => {
    // The round trip, which IS the contract. Asserted rather than trusted: the two functions
    // are inverses only if the composition is exact.
    for (const target of [1000, 700, 1500.5]) {
      const p = pointerForMovingEdge(t, rect, 'br', 'x', target, { x: 900, y: 500 }, LOCK_16_9);
      expect(p).not.toBeNull();
      const solved = computeRectResize(t, rect, 'br', p as { x: number; y: number }, LOCK_16_9);
      expect(movingCornerScene(t, rect, 'br', solved).x).toBeCloseTo(target, 9);
    }
  });

  it('the same round trip on the Y axis, under a non-uniform scale', () => {
    const st = box({ scale: { x: 2, y: 0.5 } });
    const sr = boxRect(st);
    const lr = (LOCK_16_9 * 0.5) / 2; // `sizeRatioForAspect`'s definition, spelled out
    const p = pointerForMovingEdge(st, sr, 'br', 'y', 400, { x: 900, y: 500 }, lr);
    expect(p).not.toBeNull();
    const solved = computeRectResize(st, sr, 'br', p as { x: number; y: number }, lr);
    expect(movingCornerScene(st, sr, 'br', solved).y).toBeCloseTo(400, 9);
  });

  it('every handle round-trips on the axis it drives', () => {
    // `tl` / `tr` / `bl` grow toward DECREASING coordinates on one or both axes, so a sign
    // error in the inverse would show up here and nowhere else.
    const cases = [
      { handle: 'tl', axis: 'x', target: 40 },
      { handle: 'tr', axis: 'y', target: 60 },
      { handle: 'bl', axis: 'x', target: 30 },
      { handle: 'l', axis: 'x', target: 20 },
      { handle: 't', axis: 'y', target: 55 },
    ] as const;
    for (const c of cases) {
      const p = pointerForMovingEdge(t, rect, c.handle, c.axis, c.target, { x: 300, y: 300 });
      expect(p, `${c.handle}/${c.axis}`).not.toBeNull();
      const solved = computeRectResize(t, rect, c.handle, p as { x: number; y: number });
      const landed = movingCornerScene(t, rect, c.handle, solved);
      expect(c.axis === 'x' ? landed.x : landed.y, `${c.handle}/${c.axis}`).toBeCloseTo(
        c.target,
        9,
      );
    }
  });

  it('🔴 returns NULL rather than an approximation when the target is unreachable', () => {
    // A ROTATED element: there is no axis-aligned "x edge" to put on a vertical guide, and the
    // gizmo already refuses to snap one. Stated again here, where the algebra depends on it.
    expect(
      pointerForMovingEdge(box({ rotation: 30 }), rect, 'br', 'x', 1000, { x: 9, y: 9 }),
    ).toBeNull();
    // An axis this handle does not drive.
    expect(pointerForMovingEdge(t, rect, 'r', 'y', 500, { x: 900, y: 500 })).toBeNull();
    // A target on the WRONG SIDE of the fixed corner: it would need a negative extent, and
    // `Math.abs` inside the solver would silently mirror it onto the wrong side instead.
    expect(pointerForMovingEdge(t, rect, 'br', 'x', 50, { x: 900, y: 500 })).toBeNull();
  });
});

describe('B-181 task 3 — chooseEdgeSnap: which axis leads', () => {
  const targets = { xs: [1000, 1250], ys: [600, 900] };
  const THR = 7;

  it('🔴 the NEARER target wins — the decision, asserted both ways round', () => {
    // x is 3 away, y is 5 away ⇒ x leads.
    expect(chooseEdgeSnap({ x: 997, y: 605 }, 'br', targets, THR)).toEqual({
      axis: 'x',
      target: 1000,
    });
    // Move the point so y is 1 away and x is 6 ⇒ y leads. Same call, opposite answer, so the
    // comparison is real rather than a hard-coded axis.
    expect(chooseEdgeSnap({ x: 994, y: 601 }, 'br', targets, THR)).toEqual({
      axis: 'y',
      target: 600,
    });
  });

  it('a TIE goes to x, deterministically', () => {
    // Fixed rather than "keep whichever axis led last": a stateful tie-break would make the
    // same pointer position mean two different things depending on how it was reached, which is
    // how a box starts to feel like it is fighting the author.
    expect(chooseEdgeSnap({ x: 996, y: 604 }, 'br', targets, THR)).toEqual({
      axis: 'x',
      target: 1000,
    });
  });

  it('only ever offers an axis the handle actually drives', () => {
    // `r` frees width only, so a y target in range is not a candidate …
    expect(chooseEdgeSnap({ x: 997, y: 601 }, 'r', targets, THR)).toEqual({
      axis: 'x',
      target: 1000,
    });
    // … and `b` frees height only.
    expect(chooseEdgeSnap({ x: 997, y: 601 }, 'b', targets, THR)).toEqual({
      axis: 'y',
      target: 600,
    });
  });

  it('returns null when nothing is within the threshold', () => {
    expect(chooseEdgeSnap({ x: 500, y: 200 }, 'br', targets, THR)).toBeNull();
    expect(chooseEdgeSnap({ x: 997, y: 601 }, 'br', { xs: [], ys: [] }, THR)).toBeNull();
  });
});
