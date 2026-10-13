/**
 * Pure geometry for the canvas editor — the non-React, deterministic math behind
 * the gizmo (resize/rotate), snapping, and the screen↔stage↔scene coordinate
 * conversions. Extracted from `Gizmo.tsx` / `CanvasOverlay.tsx` / `CanvasArea.tsx`
 * so it can be unit-tested in isolation (the React layer is covered by E2E).
 *
 * Coordinate spaces:
 *   - **screen / client px** — viewport pixels (pointer events).
 *   - **scene px** — the composition's own pixel grid (what the schema stores).
 *     `screen = scene * zoom + stageOrigin`, so `scene = (client - origin) / zoom`.
 *   - **element-local px** — a point inside an element's unscaled box, origin at
 *     `position`, spanning `0..size.w × 0..size.h`. The renderer maps local→scene
 *     with `Scale·Rotate` about the element's `anchor` (CSS transform-origin).
 */

/** The transform fields the gizmo math needs (a structural subset of the schema `Transform`). */
export interface BoxTransform {
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation: number;
  /** 0..1 fraction of the unscaled box — the rotate/scale pivot (CSS transform-origin). */
  anchor: { x: number; y: number };
  /** Element scale (CSS `scale(x,y)`), applied AFTER rotation about the anchor — matches
   *  the renderer (`scene-builder` `composeTransform`) and `hit-test.inverseToLocal`. */
  scale: { x: number; y: number };
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type Handle = Corner | 't' | 'b' | 'l' | 'r';

/** Smallest width/height a resize can produce (scene px). */
export const MIN_SIZE = 4;
/** Rotation snaps to the nearest 15° within this many degrees. */
export const SNAP_DEG = 6;

/** Which corner stays fixed during a resize + which axes each handle frees. */
export const RESIZE_CFG: Record<Handle, { fixed: Corner; freeW: boolean; freeH: boolean }> = {
  br: { fixed: 'tl', freeW: true, freeH: true },
  tl: { fixed: 'br', freeW: true, freeH: true },
  tr: { fixed: 'bl', freeW: true, freeH: true },
  bl: { fixed: 'tr', freeW: true, freeH: true },
  r: { fixed: 'tl', freeW: true, freeH: false },
  l: { fixed: 'tr', freeW: true, freeH: false },
  b: { fixed: 'tl', freeW: false, freeH: true },
  t: { fixed: 'bl', freeW: false, freeH: true },
};

/**
 * 🔴 **`D-155` — the two free extents, reshaped to the locked `w : h` ratio, BEFORE the
 * ratios are taken.**
 *
 * `lockRatio` is `w / h` in SIZE units and comes from `sizeRatioForAspect` — the ONE place
 * that knows how an effective aspect relates to an authored size. Nothing here spells an
 * aspect; this module only ever sees a scalar.
 *
 * ── EDGES: THE FREE AXIS LEADS, THE OTHER IS DERIVED ─────────────────────────
 *
 * A single-axis handle has one axis under the pointer and one the gesture owns, so there is
 * nothing to choose.
 *
 * ── 🔴 CORNERS: PROJECT ONTO THE DIAGONAL — AND THE USUAL ARGUMENT FOR IT IS FALSE ───
 *
 * The corner solve projects `(w, h)` orthogonally onto the ray `h = w / lockRatio` — the line
 * through the FIXED corner whose slope is the locked ratio.
 *
 * ⚠ **THIS COMMENT USED TO SAY THE ALTERNATIVE MAKES THE BOX JUMP. IT DOES NOT, AND THAT WAS
 * MEASURED RATHER THAN REASONED.** The rejected alternative is the dominant-axis rule — _"take
 * whichever extent is larger and derive the other"_ — and at the crossover `w / lockRatio === h`
 * makes BOTH of its branches return the same pair, so it is **continuous there**. Sweeping a
 * pointer across the diagonal, the largest step between consecutive outputs measured **1.76 px**
 * for the projection and **5.33 px** for dominant-axis. Neither is a jump, and a continuity
 * assertion passes for both.
 *
 * 🔴 **A comment that justifies a decision with a disproved fact is worse than no comment**: the
 * next reader checks it, finds it false, and "fixes" the decision. So the REAL difference, which
 * is feel rather than correctness:
 *
 * - **dominant-axis** returns the smallest box CONTAINING the pointer's larger extent, so the
 *   grabbed corner tracks the pointer on the leading axis and overshoots on the other. At
 *   extents `(1600, 200)` with a 16:9 lock it returns `1600 × 900`.
 * - **projection** returns the NEAREST point on the diagonal, so the box follows the pointer's
 *   overall direction and the corner drifts away from it. Same input: `1301 × 732`.
 *
 * Either is defensible; the projection is what `D-155`'s spec settled on. `aspect-lock.test.ts`
 * therefore pins the CHOICE by VALUE, off the diagonal where the two disagree — not by a
 * continuity property both of them satisfy.
 *
 * ── THE `MIN_SIZE` CLAMP SCALES THE PAIR, IT DOES NOT CLAMP AN AXIS ──────────
 *
 * Clamping one axis to `MIN_SIZE` and leaving the other is how a locked resize silently stops
 * being locked at the bottom of its range. Both extents are scaled by one factor instead, so
 * the ratio survives the clamp and the derived axis is recomputed from the CLAMPED value.
 *
 * ⚠ **The bottom-edge FLIP that `fitToAspect` performs is deliberately NOT here.** That
 * function preserves `h` and solves for `w` when solving for `h` would push the plate past the
 * bottom of the frame. That is right for a ONE-SHOT button, where the author sees a single
 * result, and wrong for a LIVE gesture: swapping which axis is preserved part-way through a
 * drag changes the solution the box is tracking, so the box relocates under a pointer that
 * did not change direction. A plate dragged out of frame stays an ordinary preflight error.
 * The flip is in the very function this feature reuses, so the next reader would otherwise
 * assume it was forgotten rather than declined.
 */
function lockExtents(
  w: number,
  h: number,
  freeW: boolean,
  freeH: boolean,
  lockRatio: number,
): { w: number; h: number } {
  let lw: number;
  let lh: number;
  if (freeW && freeH) {
    // Orthogonal projection of (w, h) onto the direction (lockRatio, 1).
    const t = (w * lockRatio + h) / (lockRatio * lockRatio + 1);
    lw = lockRatio * t;
    lh = t;
  } else if (freeW) {
    lw = w;
    lh = w / lockRatio;
  } else {
    lh = h;
    lw = lockRatio * h;
  }
  // A pointer exactly on the fixed corner projects to the origin; there is no ratio to
  // preserve at zero, so start from the smallest box that HAS one.
  if (!(lw > 0) || !(lh > 0) || !Number.isFinite(lw) || !Number.isFinite(lh)) {
    lh = MIN_SIZE;
    lw = lockRatio * MIN_SIZE;
  }
  const up = Math.max(1, MIN_SIZE / lw, MIN_SIZE / lh);
  return { w: lw * up, h: lh * up };
}

/** Rotate a vector by the angle whose cos/sin are given (2-D rotation matrix). */
export function rot(vx: number, vy: number, cos: number, sin: number): { x: number; y: number } {
  return { x: vx * cos - vy * sin, y: vx * sin + vy * cos };
}

/** Element-local coords (relative to the box top-left) of a named corner for size w×h. */
export function cornerLocal(c: Corner, w: number, h: number): { x: number; y: number } {
  switch (c) {
    case 'tl':
      return { x: 0, y: 0 };
    case 'tr':
      return { x: w, y: 0 };
    case 'bl':
      return { x: 0, y: h };
    case 'br':
      return { x: w, y: h };
  }
}

/** Element-local grab point for each handle (corner point, or edge midpoint). */
export function handleLocal(handle: Handle, w: number, h: number): { x: number; y: number } {
  switch (handle) {
    case 'r':
      return { x: w, y: h / 2 };
    case 'l':
      return { x: 0, y: h / 2 };
    case 't':
      return { x: w / 2, y: 0 };
    case 'b':
      return { x: w / 2, y: h };
    default:
      return cornerLocal(handle, w, h);
  }
}

/**
 * Map an element-local point (in the unscaled box) to scene coords using the element's
 * forward transform `Scale·Rotate about anchor`: rotate about the anchor, THEN scale in
 * scene axes. This is the exact inverse of `hit-test.inverseToLocal` and matches the
 * renderer (`scene-builder` emits `transform: scale(sx,sy) rotate(deg)` about
 * `transform-origin: anchor%`). Non-uniform scale of a rotated box yields a parallelogram.
 */
export function localToScene(t: BoxTransform, lx: number, ly: number): { x: number; y: number } {
  const { position, size, rotation, anchor, scale } = t;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const o = rot(lx - anchor.x * size.w, ly - anchor.y * size.h, cos, sin);
  return {
    x: position.x + anchor.x * size.w + scale.x * o.x,
    y: position.y + anchor.y * size.h + scale.y * o.y,
  };
}

/**
 * A rectangle in element-LOCAL coordinates — an offset (possibly non-zero-origin)
 * box inside the element's unscaled frame. `{0, 0, size.w, size.h}` is the plain
 * element box; D-110 uses an offset rect for a keyframed path's LIVE morph bounds.
 */
export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The element's own box as a {@link LocalRect}. */
export function boxRect(t: BoxTransform): LocalRect {
  return { x: 0, y: 0, w: t.size.w, h: t.size.h };
}

/** Local coords of a named corner of a {@link LocalRect}. */
export function rectCorner(c: Corner, r: LocalRect): { x: number; y: number } {
  switch (c) {
    case 'tl':
      return { x: r.x, y: r.y };
    case 'tr':
      return { x: r.x + r.w, y: r.y };
    case 'bl':
      return { x: r.x, y: r.y + r.h };
    case 'br':
      return { x: r.x + r.w, y: r.y + r.h };
  }
}

/** Local grab point for each handle on a {@link LocalRect} (corner, or edge midpoint). */
export function rectHandleLocal(handle: Handle, r: LocalRect): { x: number; y: number } {
  switch (handle) {
    case 'r':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 'l':
      return { x: r.x, y: r.y + r.h / 2 };
    case 't':
      return { x: r.x + r.w / 2, y: r.y };
    case 'b':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    default:
      return rectCorner(handle, r);
  }
}

/**
 * Compute the new `{position, size}` for a resize: the pointer (in scene coords)
 * grabs `handle`; the opposite corner stays put. Works in the element's rotated
 * frame — project the pointer→fixed-corner vector onto the element's local axes to
 * get the new width/height, clamp to {@link MIN_SIZE}, then recompute the top-left
 * so the fixed corner doesn't move. Single-axis edge handles keep the other size.
 * Delegates to {@link computeRectResize} over the element's own box.
 */
export function computeResize(
  t: BoxTransform,
  handle: Handle,
  pointerScene: { x: number; y: number },
  /** `D-155` — passed straight through; see {@link computeRectResize}. */
  lockRatio?: number | undefined,
): { position: { x: number; y: number }; size: { w: number; h: number } } {
  const r = computeRectResize(t, boxRect(t), handle, pointerScene, lockRatio);
  return { position: r.position, size: r.size };
}

/**
 * D-110 — the resize math generalized to an arbitrary LOCAL rect (a keyframed
 * path's LIVE morph bounds; `boxRect(t)` reproduces {@link computeResize}
 * exactly). The pointer projects onto the rotated local axes against the FIXED
 * rect corner → new rect extents (clamped to {@link MIN_SIZE}) → per-axis ratios
 * against the starting rect. The commit model is a uniform about-the-local-origin
 * scale (the path bake / the box resize both are), so:
 *   - `size` = the element's base size × ratio (what `size.w/h` should commit);
 *   - `position` compensates so the FIXED rect corner stays put under the
 *     post-scale pivot (`anchor⊙size'`) — correct under rotation + element scale.
 */
export function computeRectResize(
  t: BoxTransform,
  rect: LocalRect,
  handle: Handle,
  pointerScene: { x: number; y: number },
  /**
   * `D-155` — the locked `w : h` ratio in SIZE units (`sizeRatioForAspect`), or `undefined`
   * for a free resize. Optional and last, so every existing caller and every element kind
   * that has no aspect to lock keeps today's behaviour byte-for-byte.
   */
  lockRatio?: number | undefined,
): {
  position: { x: number; y: number };
  size: { w: number; h: number };
  ratioW: number;
  ratioH: number;
} {
  const { size, rotation, anchor, scale } = t;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cfg = RESIZE_CFG[handle];
  const fc = rectCorner(cfg.fixed, rect);
  const fixedScene = localToScene(t, fc.x, fc.y);
  // Element-local unit axes expressed in scene space.
  const ux = { x: cos, y: sin };
  const uy = { x: -sin, y: cos };
  // Undo the element scale (scene axes) before projecting onto the local axes, so the
  // size delta is measured in the element's OWN units — `Δscene = Scale·Rotate·Δlocal`.
  const vx = (pointerScene.x - fixedScene.x) / scale.x;
  const vy = (pointerScene.y - fixedScene.y) / scale.y;
  /*
    🔴 D-155 — THE LOCK IS APPLIED HERE, to the free extents, and NOWHERE ELSE.

    Everything below this point — the per-axis ratios, and the position solve that keeps the
    FIXED corner still under rotation and non-uniform scale — is untouched by the lock. That
    is the whole reason the constraint sits at this line: the fixed corner stays put because
    the code that pins it never learns the resize was constrained. A lock applied to
    `sizeNew`, or to `position`, would have to re-derive that pinning and would drift from it.
  */
  const rawW = cfg.freeW ? Math.abs(vx * ux.x + vy * ux.y) : rect.w;
  const rawH = cfg.freeH ? Math.abs(vx * uy.x + vy * uy.y) : rect.h;
  const locked =
    lockRatio === undefined || !(lockRatio > 0) || !Number.isFinite(lockRatio)
      ? null
      : lockExtents(rawW, rawH, cfg.freeW, cfg.freeH, lockRatio);
  // Unlocked: each axis clamps independently, exactly as before this feature existed.
  const wNew = locked?.w ?? (cfg.freeW ? Math.max(MIN_SIZE, rawW) : rect.w);
  const hNew = locked?.h ?? (cfg.freeH ? Math.max(MIN_SIZE, rawH) : rect.h);
  const ratioW = wNew / Math.max(rect.w, 1e-6);
  const ratioH = hNew / Math.max(rect.h, 1e-6);
  const sizeNew = { w: size.w * ratioW, h: size.h * ratioH };
  // Keep the fixed rect corner anchored: after the about-origin scale it sits at
  // `fc × ratio`; solve for the position under the NEW pivot. The re-anchoring
  // offset is rotated THEN scaled (scene axes), mirroring `localToScene`.
  const qf = { x: fc.x * ratioW, y: fc.y * ratioH };
  const pvx = anchor.x * sizeNew.w;
  const pvy = anchor.y * sizeNew.h;
  const ro = rot(qf.x - pvx, qf.y - pvy, cos, sin);
  return {
    position: {
      x: fixedScene.x - pvx - scale.x * ro.x,
      y: fixedScene.y - pvy - scale.y * ro.y,
    },
    size: sizeNew,
    ratioW,
    ratioH,
  };
}

/** What {@link computeRectResize} returns — named so the edge helpers can take it. */
export interface ResizeSolution {
  readonly position: { x: number; y: number };
  readonly size: { w: number; h: number };
  readonly ratioW: number;
  readonly ratioH: number;
}

/**
 * The corner a handle MOVES — the one diagonally opposite {@link RESIZE_CFG}'s fixed corner.
 *
 * For a corner handle this is the grabbed corner itself. For an EDGE handle it is a corner
 * that shares the moving edge: `r` pins `tl` and moves `br`, whose `x` IS the right edge. The
 * other axis of that corner is meaningless for an edge handle and the caller ignores it —
 * `cfg.freeW` / `cfg.freeH` already say which axis the handle drives.
 */
export function resizeMovingCorner(handle: Handle): Corner {
  switch (RESIZE_CFG[handle].fixed) {
    case 'tl':
      return 'br';
    case 'br':
      return 'tl';
    case 'tr':
      return 'bl';
    case 'bl':
      return 'tr';
  }
}

/**
 * ⭐ **`B-181` — WHERE THE MOVING EDGE ACTUALLY LANDED, in scene px.**
 *
 * The rect a resize commits scales about the LOCAL ORIGIN by `(ratioW, ratioH)` — that is the
 * commit model {@link computeRectResize} documents — so the moving corner of the new rect is
 * the old one times the ratios, projected through the NEW transform.
 *
 * 🔴 **This is a function of the SOLVED rect, never of the pointer**, and that is the whole
 * point of it. Under an aspect lock the solver returns a rect that satisfies the ratio, so the
 * moving edge is NOT under the pointer; asking the pointer where the edge is was `B-181`.
 */
export function movingCornerScene(
  t: BoxTransform,
  rect: LocalRect,
  handle: Handle,
  solved: ResizeSolution,
): { x: number; y: number } {
  const mc = rectCorner(resizeMovingCorner(handle), rect);
  const t2: BoxTransform = { ...t, position: solved.position, size: solved.size };
  return localToScene(t2, mc.x * solved.ratioW, mc.y * solved.ratioH);
}

/**
 * ⭐ **`B-181` — THE INVERSE: the pointer that puts the moving edge EXACTLY on `targetScene`,
 * with the lock still satisfied.**
 *
 * ── WHY AN INVERSE AND NOT A NUDGE ──────────────────────────────────────────
 *
 * The gesture must snap the EDGE, but {@link computeRectResize} is the one place the geometry
 * is solved and must stay so — re-deriving the rect in the gizmo would be a second solver, and
 * this repo has paid for those. So the snap is expressed as *"which pointer would have produced
 * the rect I want"*, and the answer is fed back through the SAME solver. The fixed-corner pin,
 * the `MIN_SIZE` clamp and the lock all keep working because none of them is bypassed.
 *
 * ── THE ALGEBRA (axis-aligned only — see the guard) ─────────────────────────
 *
 * At `rotation === 0` the solver reduces to `rawW = |p.x − fixed.x| / scale.x` and the moving
 * edge lands at `fixed.x + sgn·scale.x·wNew`. So a desired edge coordinate `T` fixes the
 * extent, `wNew = (T − fixed.x) / (scale.x·sgn)`, and the pointer that produces it is
 * `fixed.x + sgn·wNew·scale.x` — which for an UNLOCKED resize simplifies to exactly `T`,
 * reproducing today's behaviour byte-for-byte. That identity is why the bug was invisible
 * without the lock, and it is asserted by test.
 *
 * Under the lock the two extents are tied, so the answer depends on the handle:
 *
 * - **edge handle** (one free axis): `lockExtents` passes the driven extent through unchanged
 *   and derives the other, so the driven raw extent IS `wNew`.
 * - **corner handle** (both free): `lockExtents` PROJECTS `(rawW, rawH)` onto the locked
 *   diagonal, so infinitely many pointers give the same result. The one chosen is the point
 *   ON that diagonal — `(wNew, wNew / lockRatio)` — which is both the nearest such pointer and
 *   the corner of the very rect being committed, so the pointer ends up back on the handle.
 *
 * ⚠ **Returns `null`, never an approximation**, when the algebra has no answer: a rotated
 * element (the caller already refuses to snap one), an axis this handle does not drive, or a
 * target on the wrong side of the fixed corner — which would need a negative extent, and
 * whose `Math.abs` in the solver would silently mirror it onto the wrong side instead.
 *
 * 🔴 **The caller MUST still verify the result against the re-solved rect.** `lockExtents`
 * owns a `MIN_SIZE` up-scale that can override any target — a locked pair whose DERIVED axis
 * falls under the floor is scaled back up, moving the driven axis with it. This function
 * deliberately does NOT re-implement that clamp: a second copy of it here is exactly how the
 * two would drift. So the contract is *"the pointer that solves the algebra"*, and the gizmo
 * confirms the edge really landed before drawing anything. A guide for a snap that did not
 * happen is the other half of `B-181`, and measuring beats predicting.
 */
export function pointerForMovingEdge(
  t: BoxTransform,
  rect: LocalRect,
  handle: Handle,
  axis: 'x' | 'y',
  targetScene: number,
  pointerScene: { x: number; y: number },
  lockRatio?: number | undefined,
): { x: number; y: number } | null {
  // Axis-aligned only: with a rotation there is no "x edge" to put on a vertical guide. The
  // gizmo already gates snapping on `rotation === 0`; this is the same rule, stated where the
  // algebra depends on it rather than trusted from a caller.
  if (t.rotation !== 0) return null;
  if (!(t.scale.x > 0) || !(t.scale.y > 0)) return null;
  const cfg = RESIZE_CFG[handle];
  if (axis === 'x' ? !cfg.freeW : !cfg.freeH) return null;

  const fc = rectCorner(cfg.fixed, rect);
  const mc = rectCorner(resizeMovingCorner(handle), rect);
  const fixedScene = localToScene(t, fc.x, fc.y);
  // Which side of the fixed corner the moving corner sits on, in LOCAL rect coords. The
  // ratios are positive, so the sign survives the scale-about-origin commit.
  const sgnX = Math.sign(mc.x - fc.x) || 1;
  const sgnY = Math.sign(mc.y - fc.y) || 1;

  // The rect extent the target demands on the driven axis.
  const driven =
    axis === 'x'
      ? (targetScene - fixedScene.x) / (t.scale.x * sgnX)
      : (targetScene - fixedScene.y) / (t.scale.y * sgnY);
  // A target on the far side of the fixed corner would need a negative extent — the box
  // cannot reach it by growing, and `Math.abs` in the solver would silently mirror it.
  if (!(driven > 0) || !Number.isFinite(driven)) return null;

  // A LOCKED CORNER is the only case that needs the other axis aimed too: an edge handle
  // passes its driven extent straight through `lockExtents`, and an unlocked corner leaves the
  // other axis exactly where the author is holding it — which is what keeps the unlocked path
  // byte-identical to before this change.
  const lr =
    lockRatio !== undefined && lockRatio > 0 && Number.isFinite(lockRatio) && cfg.freeW && cfg.freeH
      ? lockRatio
      : null;
  const rawW = axis === 'x' ? driven : lr === null ? null : lr * driven;
  const rawH = axis === 'y' ? driven : lr === null ? null : driven / lr;

  return {
    x: rawW === null ? pointerScene.x : fixedScene.x + sgnX * rawW * t.scale.x,
    y: rawH === null ? pointerScene.y : fixedScene.y + sgnY * rawH * t.scale.y,
  };
}

/**
 * ⭐ **`B-181` task 3 — WHICH AXIS LEADS when a locked CORNER could snap on either.**
 *
 * 🔴 **This is a design DECISION, not a spelling, and it is recorded as one.** With an aspect
 * lock the two extents are tied, so satisfying a target on one axis FORCES the other; a corner
 * drag generally cannot land on two targets at once. Something has to choose, and the wrong
 * choice makes the box fight the author.
 *
 * **The rule: the NEAREST target wins; a tie goes to `x`.**
 *
 * Why nearest rather than the alternatives:
 *
 * - It is the same currency the THRESHOLD already uses. `thr` is `SNAP_PX / scale` — screen
 *   pixels — and both axes are tested against that one value, so a scene-px distance is a
 *   screen-px distance times the same constant on both axes. "Nearest" therefore means nearest
 *   *on screen*, which is what the author is looking at.
 * - The obvious alternative — "the axis with the larger pointer delta drives" — is actively
 *   wrong HERE, because `lockExtents` projects a corner pointer onto the locked diagonal. The
 *   larger delta is then an artefact of that projection rather than a statement of intent, so
 *   it would routinely snap the axis the author was not aiming at.
 * - The tie-break is fixed (`x`) rather than "keep the previous axis", so the result depends
 *   only on where the pointer is. A stateful tie-break makes the same pointer position mean
 *   two different things depending on how it was reached, which is how a box starts to feel
 *   like it is fighting back.
 *
 * ⚠ The FORCED axis gets no guide from this function, and deliberately: it did not snap, it
 * was derived. Whether it happens to land on a target too is a question about the COMMITTED
 * rect, which the caller answers by measuring — see `B-181`'s guide rule.
 */
export function chooseEdgeSnap(
  edge: { x: number; y: number },
  handle: Handle,
  targets: { xs: readonly number[]; ys: readonly number[] },
  thr: number,
): { axis: 'x' | 'y'; target: number } | null {
  const cfg = RESIZE_CFG[handle];
  const tx = cfg.freeW ? snapValue(edge.x, targets.xs, thr) : null;
  const ty = cfg.freeH ? snapValue(edge.y, targets.ys, thr) : null;
  if (tx === null && ty === null) return null;
  if (ty === null) return { axis: 'x', target: tx as number };
  if (tx === null) return { axis: 'y', target: ty };
  // Both in range: nearest wins, `x` on a tie.
  return Math.abs(ty - edge.y) < Math.abs(tx - edge.x)
    ? { axis: 'y', target: ty }
    : { axis: 'x', target: tx };
}

/**
 * Recover the rotation pivot's client position from the grabbed handle's client
 * position and the handle's element-local offset from the pivot (pre-zoom). The offset is
 * rotated by the element angle, scaled by the element's `scaleX`/`scaleY` (scene axes —
 * matching the renderer's `Scale·Rotate`), then by the `zoom`, and subtracted. `scaleX` /
 * `scaleY` default to 1 so an unscaled element behaves exactly as before.
 */
export function pivotClientFromGrab(
  grabX: number,
  grabY: number,
  offLocalX: number,
  offLocalY: number,
  rotationDeg: number,
  zoom: number,
  scaleX = 1,
  scaleY = 1,
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const o = rot(offLocalX, offLocalY, cos, sin);
  return { x: grabX - zoom * scaleX * o.x, y: grabY - zoom * scaleY * o.y };
}

/** A screen-space point (overlay coords = scene × zoom). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Project the element's selection-box geometry into screen space (overlay coords, i.e.
 * `scene × zoom`) using the same `Scale·Rotate about anchor` map as the renderer. Returns
 * the four corners + the centre of the rendered box — a PARALLELOGRAM under non-uniform
 * scale — so the gizmo can draw a frame and place screen-sized handles that stay glued to
 * the shape. Corners are named by their UNSCALED-local position (`tl` = local (0,0), etc.).
 */
export function gizmoCorners(
  t: BoxTransform,
  zoom: number,
): { tl: ScreenPoint; tr: ScreenPoint; bl: ScreenPoint; br: ScreenPoint; center: ScreenPoint } {
  return gizmoCornersOfRect(t, boxRect(t), zoom);
}

/**
 * D-110 — {@link gizmoCorners} generalized to an arbitrary LOCAL rect: projects the
 * rect's corners through the SAME `Scale·Rotate about anchor` map (the pivot stays
 * `anchor⊙size` — the true CSS transform-origin — regardless of the rect), so a
 * keyframed path's LIVE morph bounds compose correctly with rotation + scale.
 */
export function gizmoCornersOfRect(
  t: BoxTransform,
  rect: LocalRect,
  zoom: number,
): { tl: ScreenPoint; tr: ScreenPoint; bl: ScreenPoint; br: ScreenPoint; center: ScreenPoint } {
  const at = (lx: number, ly: number): ScreenPoint => {
    const p = localToScene(t, lx, ly);
    return { x: p.x * zoom, y: p.y * zoom };
  };
  return {
    tl: at(rect.x, rect.y),
    tr: at(rect.x + rect.w, rect.y),
    bl: at(rect.x, rect.y + rect.h),
    br: at(rect.x + rect.w, rect.y + rect.h),
    center: at(rect.x + rect.w / 2, rect.y + rect.h / 2),
  };
}

/** Angle (deg) of the vector `from → to`, for orienting cursors / edge strips. */
export function screenAngleDeg(from: ScreenPoint, to: ScreenPoint): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/** Euclidean distance between two screen points (edge-strip length). */
export function screenDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * New rotation (deg) during a rotate gesture: the start angle plus the change in
 * cursor angle about the pivot. When `snap`, snaps to the nearest 15° within
 * {@link SNAP_DEG}. Rounded to 2 dp (matches the committed value).
 */
export function computeRotationAngle(
  startAngleDeg: number,
  startCursorDeg: number,
  cursorDeg: number,
  snap: boolean,
): number {
  let next = startAngleDeg + (cursorDeg - startCursorDeg);
  if (snap) {
    const nearest = Math.round(next / 15) * 15;
    if (Math.abs(next - nearest) <= SNAP_DEG) next = nearest;
  }
  return Number(next.toFixed(2));
}

/**
 * Nearest target to `v` within `thr`, or null. Used to snap a single resize edge.
 *
 * ⚠ **`B-181` — that last sentence was already right, and the CALLER was wrong.** For a year the
 * gizmo handed this function the POINTER and named the result an edge snap. The name stated the
 * contract correctly; nothing enforced it. It is honest again now that `chooseEdgeSnap` feeds it
 * `movingCornerScene`'s answer, and it is left unchanged deliberately — see CLAUDE.md's rule that
 * a predicate's NAME is part of its contract.
 */
export function snapValue(v: number, targets: readonly number[], thr: number): number | null {
  let best: { t: number; d: number } | null = null;
  for (const t of targets) {
    const d = Math.abs(t - v);
    if (d <= thr && (best === null || d < best.d)) best = { t, d };
  }
  return best === null ? null : best.t;
}

/**
 * Snap one axis of a moving box: try the box's near / centre / far anchors against
 * every target and pick the closest within `threshold`. Returns the adjusted origin
 * and the guide line (scene coord) to draw, or null when nothing is in range.
 */
export function snapAxis(
  origin: number,
  size: number,
  targets: readonly number[],
  threshold: number,
): { value: number; guide: number } | null {
  const anchors = [origin, origin + size / 2, origin + size];
  let best: { adj: number; guide: number } | null = null;
  for (const a of anchors) {
    for (const tg of targets) {
      const d = tg - a;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best.adj))) {
        best = { adj: d, guide: tg };
      }
    }
  }
  return best === null ? null : { value: origin + best.adj, guide: best.guide };
}

/** Convert a client/viewport point to scene coords given the stage rect + zoom. */
export function screenToScene(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  scale: number,
): { x: number; y: number } {
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

/**
 * B-027 — the pasteboard margin per side (SCENE px) is the LARGER of an absolute minimum or
 * ONE full frame: `max(PASTEBOARD_MIN_X, frameWidth)` left + right,
 * `max(PASTEBOARD_MIN_Y, frameHeight)` top + bottom. The absolute floor keeps the pasteboard
 * usefully large even for a TINY frame (a 1× multiplier alone made a 100×100 frame a
 * 300×300 pasteboard, so the cover-fit min-zoom shot to ~428% and froze zoom); once the
 * frame exceeds the floor the margin grows with it (one frame per side).
 */
export const PASTEBOARD_MIN_X = 5000;
export const PASTEBOARD_MIN_Y = 3000;

/**
 * The canvas STAGE layout (scene px): the FIXED pasteboard. Margin per side =
 * `max(PASTEBOARD_MIN_X, width)` / `max(PASTEBOARD_MIN_Y, height)`; total extent =
 * `frame + 2·margin` per axis, and `frame.{x,y}` is the frame's CONSTANT inset into the
 * stage (= the margin) — scene (0,0) sits there. A pure function of the resolution (NOT
 * content-grown), so dragging a shape off-frame moves nothing but the shape (no extent
 * growth, no origin shift). Element drags/nudges are CLAMPED to this extent
 * ({@link clampDeltaToPasteboard}) so no shape can cross into the clipped region — the
 * pasteboard IS the whole workable area.
 */
export function pasteboardLayout(resolution: { width: number; height: number }): {
  width: number;
  height: number;
  frame: { x: number; y: number };
} {
  const marginX = Math.max(PASTEBOARD_MIN_X, resolution.width);
  const marginY = Math.max(PASTEBOARD_MIN_Y, resolution.height);
  return {
    width: resolution.width + 2 * marginX,
    height: resolution.height + 2 * marginY,
    frame: { x: marginX, y: marginY },
  };
}

/** The pasteboard's bounds in SCENE coordinates (scene 0,0 = frame top-left). The frame
 *  is the constant inset, so the pasteboard spans `[−margin, frame + margin]` per axis. */
export function pasteboardSceneBounds(resolution: { width: number; height: number }): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const { width, height, frame } = pasteboardLayout(resolution);
  return { minX: -frame.x, minY: -frame.y, maxX: width - frame.x, maxY: height - frame.y };
}

/**
 * B-027 — clamp a move so an element/group's full bounding box `[boxMin, boxMax]` (one
 * axis) stays inside the pasteboard `[padMin, padMax]`. Returns the clamped DELTA (works
 * for a single element — box = its own AABB — and a multi-select group — box = the
 * combined AABB, so the group stops as soon as any member hits an edge). Edge cases:
 *
 *  - **Oversized** (box bigger than the pasteboard on this axis): the full box cannot fit,
 *    so CENTER it on this axis (it stops following the pointer here) rather than fighting —
 *    its center sits at the pasteboard center, maximally visible.
 *  - **Pre-existing outside** (a shape loaded/imported beyond the bounds): the clamp only
 *    TIGHTENS — it never pushes the box further out than where it started (`delta = 0`),
 *    and lets it move inward freely; once inside, normal bounds apply. So an outside shape
 *    is recoverable (draggable back in), never trapped or violently snapped.
 */
export function clampDeltaToPasteboard(
  delta: number,
  boxMin: number,
  boxMax: number,
  padMin: number,
  padMax: number,
): number {
  if (boxMax - boxMin >= padMax - padMin) {
    // Oversized: align the box center with the pasteboard center.
    return (padMin + padMax) / 2 - (boxMin + boxMax) / 2;
  }
  // Keep `[boxMin+delta, boxMax+delta]` inside `[padMin, padMax]`, but relax each bound
  // toward 0 (the start) so a box that begins outside isn't yanked / pushed further out.
  const lo = Math.min(padMin - boxMin, 0);
  const hi = Math.max(padMax - boxMax, 0);
  return Math.max(lo, Math.min(hi, delta));
}

/**
 * Cursor-anchored zoom: the new scroll offset (one axis) that keeps a scene point fixed
 * under the cursor across a zoom. `scenePoint` is the scene coordinate that was under the
 * cursor, captured BEFORE the zoom (`= (client − stageScreenBefore) / oldZoom`);
 * `stageScreen` is the stage's screen origin (this axis) AFTER the zoom relayout but
 * BEFORE this correction; `scroll` is the current scroll offset. After the relayout the
 * point sits at `stageScreen + scenePoint·newZoom`; scrolling by the difference from
 * `client` lands it back under the cursor — so the zoom doesn't jump.
 */
export function zoomAnchorScroll(
  scroll: number,
  stageScreen: number,
  scenePoint: number,
  newZoom: number,
  client: number,
): number {
  return scroll + stageScreen + scenePoint * newZoom - client;
}

/** Clamp a zoom factor to `[min, max]`; non-finite input falls back to `fallback`. */
export function clampZoom(z: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(z)) return fallback;
  return Math.max(min, Math.min(max, z));
}

/**
 * B-027 — the cover-fit over-cover bias (SCENE→viewport px). Each axis target is nudged up by
 * this many px before the ratio is taken (see {@link coverZoom}), so the scaled pasteboard is
 * always a HAIR larger than the viewport, never exactly equal. Without it the cover axis lands
 * `extent × (viewport/extent) === viewport` EXACTLY — zero overflow slack — and the centering
 * scroll + the browser's sub-pixel scroll/layout rounding then leave a hairline of the
 * `#0e1018` surround on the TRAILING (right/bottom) edges while the leading (left/top) edges,
 * pinned at the scroll start, stay flush. A couple px of (already-scrollable) over-cover gives
 * the scroll enough slack that all four edges stay covered — the owner prefers a hair of
 * overflow to any visible surround.
 */
export const COVER_OVERSHOOT_PX = 2;

/**
 * B-027 — the COVER-fit zoom: the SMALLEST zoom at which the pasteboard (`extent`) still
 * fully COVERS the viewport on BOTH axes, so no empty surround is ever visible at maximum
 * zoom-out. It is the MAX of the two axis ratios (NOT min — that would be the contain fit,
 * which leaves margins): the axis that needs the most zoom to cover sets the floor, and the
 * other axis overflows (scrollable). Each axis target is biased UP by {@link COVER_OVERSHOOT_PX}
 * so the cover axis OVER-covers by that hair instead of meeting the viewport exactly (which a
 * sub-pixel scroll then under-covers on the trailing edges). Used as the dynamic minimum zoom.
 * Returns 0 when any dimension is non-positive (viewport not measured yet) so the caller falls
 * back to the hard floor.
 */
export function coverZoom(
  viewportW: number,
  viewportH: number,
  extentW: number,
  extentH: number,
): number {
  if (viewportW <= 0 || viewportH <= 0 || extentW <= 0 || extentH <= 0) return 0;
  return Math.max(
    (viewportW + COVER_OVERSHOOT_PX) / extentW,
    (viewportH + COVER_OVERSHOOT_PX) / extentH,
  );
}

/** Largest zoom that fits `scene` inside `viewport` (minus `margin`), or null if degenerate. */
export function fitZoom(
  viewportW: number,
  viewportH: number,
  sceneW: number,
  sceneH: number,
  margin: number,
): number | null {
  const z = Math.min((viewportW - margin) / sceneW, (viewportH - margin) / sceneH);
  return Number.isFinite(z) && z > 0 ? z : null;
}

/**
 * D-120 — the pixel grid is shown only when one scene pixel maps to at least this many SCREEN px
 * (i.e. `zoom ≥ PIXEL_GRID_MIN_ZOOM`). Below it a 1px-per-cell grid is an illegible smear; 8 px
 * (800%) leaves a wide useful pixel-editing band up to the 6400% (`ZOOM_MAX = 64`) ceiling.
 */
export const PIXEL_GRID_MIN_ZOOM = 8;
/** D-120 — every Nth grid line is emphasized (graph-paper), aligned to scene multiples of N. */
export const PIXEL_GRID_MAJOR_EVERY = 10;

/** D-120 — whether the pixel grid should be drawn at this zoom (one scene px ≥ the threshold). */
export function pixelGridVisible(zoom: number): boolean {
  return zoom >= PIXEL_GRID_MIN_ZOOM;
}

/**
 * D-122 — whether a MOVE gesture (drag or arrow-nudge) should snap to whole scene pixels.
 * True only when the pixel grid is visible (zoom ≥ the threshold, so there are lines to
 * land on), the operator's Snapping preference is on (the master snap switch also governs
 * pixel-grid snapping — so "snapping off" still drags freely), and `alt` — the momentary
 * free-placement bypass — is NOT held. Pure so the drag path, the nudge path, and the unit
 * tests share ONE gate. Below the threshold this is always false.
 *
 * ⚠ `B-180` — "false below the threshold" no longer means the drag COMMITS a fraction there.
 * This gate governs the LIVE grid snap and the nudge; what a drag/resize commits is gated by
 * {@link quantiseDragCommit}, at every zoom. Do NOT widen this one to close that gap — the
 * reasons are in that function's docstring, and both are load-bearing.
 */
export function pixelSnapActive(zoom: number, snappingEnabled: boolean, alt: boolean): boolean {
  return snappingEnabled && !alt && pixelGridVisible(zoom);
}

/**
 * ⭐ **`B-180` — should this drag COMMIT a whole scene pixel? At EVERY zoom.**
 *
 * ── WHY THIS IS A SECOND GATE AND NOT A WIDER {@link pixelSnapActive} ───────
 *
 * `D-122` scoped whole-pixel snapping to grid zoom and said so explicitly — *"below the grid
 * threshold, today's behavior is unchanged"* — and `B-180`'s fix supersedes that scope. But the
 * supersession CANNOT be spelled by relaxing `pixelSnapActive`, and finding out why is most of
 * this function's reason to exist:
 *
 *  1. 🔴 **It would silently delete smart-guide snapping.** The drag handler is an `else if`
 *     chain in which `pixelSnapActive` SUPERSEDES the element/canvas/ruler guides (correctly, at
 *     grid zoom, where the grid is a finer target). True at every zoom, that branch would swallow
 *     the guides at every zoom, and snapping a box flush to its neighbour would stop working —
 *     while every test of `pixelSnapActive` still passed.
 *  2. **It would change the arrow-NUDGE too.** `snapNudgeToPixel`'s first-nudge-to-the-next-integer
 *     rule is gated on the same predicate and is `D-122`'s deliberate design, not incidental.
 *
 * So the grid-zoom gate is left exactly as it was, and quantisation is a POST-STEP applied to the
 * axes a guide did NOT claim. See the drag handler for the ordering.
 *
 * ── THE GATE IS JUST `!alt`, AND THAT IS THE OWNER'S DECISION ───────────────
 *
 * `Alt` is `D-122`'s momentary free-placement bypass and is PRESERVED — it now matters at every
 * zoom, because it is **the only way to place sub-pixel by drag**. That is why the master
 * snapping switch is deliberately NOT consulted here: if "snapping off" also bypassed, there
 * would be two ways, and the owner's decision names one.
 *
 * ⚠ Inspector-TYPED values stay free, exactly as `D-122` decided. A typed `124.5` is a value the
 * author can see and meant; it is not dust. This gates the DRAG only.
 */
export function quantiseDragCommit(alt: boolean): boolean {
  return !alt;
}

/**
 * D-122 — snap a DRAGGED scene position to the nearest whole pixel (the pixel grid is the
 * snap target at grid zoom). `Math.round` tracks the pointer to the closest line, so the
 * element and its gizmo step whole pixels LIVE under the cursor. Applied to the single
 * element's position, or to the group ANCHOR (its snapped delta then moves every member, so
 * relative offsets are preserved). Caller gates on {@link pixelSnapActive}.
 */
export function snapDragToPixel(pos: number): number {
  return Math.round(pos);
}

/**
 * D-122 — the target scene coordinate for one arrow-NUDGE step at grid zoom. The FIRST
 * nudge of a FRACTIONAL coordinate lands on the NEXT integer in the nudge direction
 * (6.69 → right → 7, → left → 6), regardless of the step MAGNITUDE — so an accelerated
 * (Shift) nudge off a fractional value still just lands on the grid. Once ON the grid, a
 * nudge steps by the full signed step (±1, or ±10 with Shift). `signedStep` is the already
 * signed, already scaled step (+1/−1/+10/−10). A near-integer coordinate (within a float
 * epsilon) counts as on-grid so a whole-pixel value isn't nudged twice.
 */
export function snapNudgeToPixel(coord: number, signedStep: number): number {
  if (signedStep === 0) return coord;
  const rounded = Math.round(coord);
  if (Math.abs(coord - rounded) < 1e-6) return rounded + signedStep; // already on the grid
  return signedStep > 0 ? Math.ceil(coord) : Math.floor(coord); // first-snap to the next integer
}

/** D-120 — one visible pixel-grid line: its `scene` coordinate (for major/minor styling) and the
 *  DEVICE-pixel x/y at which a 1px stroke should be drawn (already snapped + half-pixel-offset). */
export interface PixelGridLine {
  scene: number;
  devicePx: number;
}

/**
 * D-120 — the device-pixel-snapped positions of the visible pixel-grid lines on ONE axis, for the
 * canvas grid. `originCss` is the screen position (CSS px, in the canvas's own top-left frame) of
 * scene 0 — i.e. the rulers' origin on this axis; `zoom` is screen px per scene px; `lengthCss` is
 * the visible extent (CSS px); `dpr` the devicePixelRatio. A line exists at every integer scene
 * coordinate, whose TRUE screen pos is `originCss + scene·zoom`; only the lines inside `[0,
 * lengthCss]` are returned (viewport cull). Each is SNAPPED to the device-pixel raster —
 * `Math.round(pos·dpr + rasterPhase) + 0.5` — so a 1-device-px stroke lands on a single physical
 * pixel and is crisp at ANY (even fractional) zoom, never anti-aliased across two. A CSS
 * `repeating` gradient can't do this (its fixed fractional period drifts off the raster); snapping
 * each line INDEPENDENTLY also means no accumulating drift — every line stays within half a device
 * pixel of its true scene coordinate (invisible as position at high zoom, decisive for crispness),
 * so the grid still aligns with the rulers.
 *
 * B-042 — `rasterPhase` is the grid canvas's own fractional device offset on this axis
 * ({@link gridCanvasAlignment}.phase). The overlay the canvas lives in sits at an arbitrary
 * (fractional) device position, so snapping to the canvas-INTERNAL raster alone lands strokes off
 * the PHYSICAL pixel grid the content is composited on. With the phase folded in (and the canvas
 * element floor-aligned to the device raster via the alignment's `nudgeCss`),
 * `cssPos·dpr + rasterPhase` IS the line's true screen device position. Defaults to 0.
 *
 * B-042 owner-machine round — the snap is `floor(...) + 0.5`, NOT `round`: the stroke is the
 * device pixel CONTAINING the line's true position. The content paints at its layout position
 * (verified-deselected paint profiles: one honest AA pixel), and the stage's per-axis device
 * phase is an arbitrary fraction (measured Y ≈ 0.68 in every owner reading, X a scroll lottery).
 * `round` picks the NEAREST boundary, which at phase > ½ puts the whole stroke one pixel PAST the
 * edge (owner-visible: horizontal strokes +0.81 device px below every content row); `floor`
 * always picks the pixel the line passes through, so the stroke and a content edge at that
 * coordinate share a pixel at ANY phase — the stroke CENTER stays within ½ device px of the true
 * line position, the tightest a crisp 1-px stroke can do.
 */
export function pixelGridLines(
  originCss: number,
  zoom: number,
  lengthCss: number,
  dpr: number,
  rasterPhase = 0,
): PixelGridLine[] {
  if (zoom <= 0 || lengthCss <= 0 || dpr <= 0) return [];
  const firstScene = Math.ceil(-originCss / zoom); // first integer scene coord with pos ≥ 0
  const lastScene = Math.floor((lengthCss - originCss) / zoom); // last with pos ≤ lengthCss
  const out: PixelGridLine[] = [];
  for (let scene = firstScene; scene <= lastScene; scene++) {
    const cssPos = originCss + scene * zoom;
    out.push({ scene, devicePx: Math.floor(cssPos * dpr + rasterPhase) + 0.5 });
  }
  return out;
}

/**
 * B-042 — the snapped position + size (CSS px, overlay coords) for a RULER tick mark, so the
 * mark occupies EXACTLY the same physical device pixel as the grid stroke for that coordinate
 * (`floor` of the true screen device position — the containing pixel, matching
 * {@link pixelGridLines}). `cssPos` is the tick's ideal overlay position
 * (`rulerOrigin + scene·zoom`), `rasterPhase` the overlay's fractional device offset on this
 * axis. Keeps the D-120 grid↔ruler contract exact while both use the containing-pixel
 * convention; the 1-device-px size also makes the marks crisp at fractional dpr.
 */
export function snapMarkToGridPixel(
  cssPos: number,
  dpr: number,
  rasterPhase: number,
): { posCss: number; sizeCss: number } {
  if (dpr <= 0) return { posCss: cssPos, sizeCss: 1 };
  return { posCss: (Math.floor(cssPos * dpr + rasterPhase) - rasterPhase) / dpr, sizeCss: 1 / dpr };
}

/** B-042 — how to place the grid canvas so its bitmap is a faithful window onto the PHYSICAL
 *  device-pixel raster on one axis (see {@link gridCanvasAlignment}). */
export interface GridRasterAlignment {
  /** The integer device-px screen coordinate the canvas origin is placed on (floor of the true
   *  position, so the nudge never uncovers the viewport's leading edge). */
  deviceOrigin: number;
  /** Sub-CSS-px offset for the canvas's `left`/`top` so its screen position lands exactly ON
   *  `deviceOrigin` — always ≤ 0 (the canvas starts at or before the overlay origin). */
  nudgeCss: number;
  /** The overlay's fractional device offset `[0, 1)` — fed to {@link pixelGridLines} as
   *  `rasterPhase` so the per-line snap targets the physical raster, not the canvas-internal one. */
  phase: number;
}

/**
 * B-042 — device-raster alignment for the grid canvas on one axis. The overlay the grid canvas
 * lives in sits at an ARBITRARY screen position (`screenCssPos` — fractional in the real studio
 * layout, e.g. 298.390625, at every dpr), so a canvas naively placed at its origin is composited at
 * a fractional device offset: the compositor then snaps or resamples the whole layer (measured:
 * −0.39 device px at dpr 1, −0.5 at dpr 1.25), displacing every "snapped" stroke off the physical
 * raster. Placing the canvas at `floor(screenCssPos·dpr)` instead — via the sub-CSS-px `nudgeCss`
 * on its `left`/`top` — gives the layer an integer device origin (nothing to snap or resample),
 * and `phase` carries the fraction into the per-line snap so strokes land on the physical pixel
 * nearest their true screen position. Degenerate inputs return the identity alignment.
 */
export function gridCanvasAlignment(screenCssPos: number, dpr: number): GridRasterAlignment {
  if (dpr <= 0 || !Number.isFinite(screenCssPos)) return { deviceOrigin: 0, nudgeCss: 0, phase: 0 };
  const device = screenCssPos * dpr;
  const deviceOrigin = Math.floor(device);
  return { deviceOrigin, nudgeCss: (deviceOrigin - device) / dpr, phase: device - deviceOrigin };
}

/**
 * B-042 — the grid canvas's backing-store size (device px) and the CSS size that shows it at
 * raster scale EXACTLY 1 (`cssPx·dpr === devicePx`). D-120 sized the backing to
 * `round(viewport·dpr)` but displayed it at `viewport` CSS px, so at fractional dpr the bitmap was
 * stretched by `round(w·dpr)/(w·dpr)` (measured 1.00031 at dpr 1.25) and stroke positions drifted
 * linearly across the viewport, past the ≤½-device-px promise. Sizing the CSS box FROM the backing
 * makes the scale exactly 1; the +2 device px overspan keeps the viewport covered on both edges
 * despite the ≤1-device-px floor-alignment nudge (the overlay clips the sub-pixel overhang).
 */
export function gridBackingSize(
  lengthCss: number,
  dpr: number,
): { devicePx: number; cssPx: number } {
  if (lengthCss <= 0 || dpr <= 0) return { devicePx: 0, cssPx: 0 };
  const devicePx = Math.round(lengthCss * dpr) + 2;
  return { devicePx, cssPx: devicePx / dpr };
}

/**
 * B-042 — Blink's LayoutUnit quantization: CSS lengths are stored in 1/64-px units,
 * TRUNCATED toward zero (`style.left = "2.2749px"` measured to render a rect at 2.265625 in the
 * preview iframe). The preview positions elements via `style.left/top` in SCENE units, so at high
 * zoom the quantum is magnified to `zoom·dpr/64` device px (1.25 device px at 6400% / dpr 1.25) —
 * the selection gizmo projecting the RAW model coordinate therefore sat up to that far OUTSIDE
 * the rendered edge at fractional coords (owner-measured +1.0156 dev px; exactly 0 at integer
 * coords). Quantizing the gizmo's box through the same lattice makes the overlay trace the box
 * the engine ACTUALLY laid out; the E2E compares against the real rendered rect, so an engine
 * change in this rule fails loudly rather than drifting silently.
 */
export function layoutQuantize(v: number): number {
  return Math.trunc(v * 64) / 64;
}

/** B-042 — a {@link BoxTransform} with its LAYOUT-driven fields (position + size) passed through
 *  {@link layoutQuantize}, matching how the preview iframe lays the element out. The
 *  transform-driven fields (rotation / anchor / scale — CSS transforms, float-precision in the
 *  engine) are untouched. Used by the gizmo's VISUAL projection only — interaction math stays on
 *  the raw model. */
export function quantizeBoxToLayout(t: BoxTransform): BoxTransform {
  return {
    ...t,
    position: { x: layoutQuantize(t.position.x), y: layoutQuantize(t.position.y) },
    size: { w: layoutQuantize(t.size.w), h: layoutQuantize(t.size.h) },
  };
}
