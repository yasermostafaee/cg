import type { AnchorPoint } from '@cg/shared-schema';

/**
 * D-110 structure lock (owner decision 2026-07-11) — pure per-point-set math for
 * STRUCTURAL path edits, applied by the store to the static base AND every path
 * keyframe snapshot so a path's anchor set (ids + count) stays identical across
 * all of them. Shape edits (move anchor / drag handle) never come through here —
 * they record into the current frame's snapshot only (that IS the morph).
 */

/** Evaluate the cubic segment a→b (runtime control-point convention) at `t`. */
export function segmentPointAt(
  a: AnchorPoint,
  b: AnchorPoint,
  t: number,
): { x: number; y: number } {
  const c1x = a.x + (a.out?.x ?? 0);
  const c1y = a.y + (a.out?.y ?? 0);
  const c2x = b.x + (b.in?.x ?? 0);
  const c2y = b.y + (b.in?.y ?? 0);
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.y,
  };
}

/** The segment's derivative (tangent direction) at `t`. */
export function segmentTangentAt(
  a: AnchorPoint,
  b: AnchorPoint,
  t: number,
): { x: number; y: number } {
  const c1x = a.x + (a.out?.x ?? 0);
  const c1y = a.y + (a.out?.y ?? 0);
  const c2x = b.x + (b.in?.x ?? 0);
  const c2y = b.y + (b.in?.y ?? 0);
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (c1x - a.x) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (b.x - c2x),
    y: 3 * mt * mt * (c1y - a.y) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (b.y - c2y),
  };
}

/**
 * How the inserted anchor is shaped, per set:
 *  - `corner` — a handle-less corner (Ctrl-click / the menu's Add point).
 *  - `smooth-drag` — the operator's drag-defined mirrored handles, the SAME
 *    deltas in every set (what the operator shaped is what every keyframe gets,
 *    and the interpolated shape matches the drag feedback).
 *  - `smooth-tangent` — the menu's Add curve point: tangent-aligned mirrored
 *    handles derived from EACH set's own curve at `t` (direction = the local
 *    tangent, magnitude = max(chord/6, 4) — the existing menu rule).
 */
export type PathInsertSpec =
  | { kind: 'corner' }
  | { kind: 'smooth-drag'; out: { x: number; y: number } }
  | { kind: 'smooth-tangent' };

/**
 * Insert one anchor (with the SHARED `id`) into segment `segIndex` of ONE point
 * set, positioned on that set's own cubic at parametric `t` — the same placement
 * math the editor's nearest-point insert has always used (deliberately NOT a de
 * Casteljau subdivision; neighbor handles are untouched, matching the existing
 * B-056/D-124 insert semantics per set). Returns the input unchanged (copied)
 * when the segment doesn't exist (defensive for malformed external sets).
 */
export function splitSegmentAt(
  points: readonly AnchorPoint[],
  segIndex: number,
  t: number,
  id: string,
  spec: PathInsertSpec,
): AnchorPoint[] {
  const a = points[segIndex];
  const b = points[(segIndex + 1) % points.length];
  if (a === undefined || b === undefined) return [...points];
  const at = segmentPointAt(a, b, t);
  let mid: AnchorPoint;
  if (spec.kind === 'corner') {
    mid = { id, x: at.x, y: at.y, smooth: false };
  } else if (spec.kind === 'smooth-drag') {
    mid = {
      id,
      x: at.x,
      y: at.y,
      smooth: true,
      out: { ...spec.out },
      in: { x: -spec.out.x, y: -spec.out.y },
    };
  } else {
    const tan = segmentTangentAt(a, b, t);
    const chord = Math.hypot(b.x - a.x, b.y - a.y) || 24;
    const len = Math.hypot(tan.x, tan.y) || 1;
    const ux = tan.x / len;
    const uy = tan.y / len;
    const mag = Math.max(chord / 6, 4);
    mid = {
      id,
      x: at.x,
      y: at.y,
      smooth: true,
      out: { x: ux * mag, y: uy * mag },
      in: { x: -ux * mag, y: -uy * mag },
    };
  }
  const next = [...points];
  next.splice(segIndex + 1, 0, mid);
  return next;
}

/** Remove the anchor with `id` from one point set (re-stitch = plain filter). */
export function removeAnchorById(points: readonly AnchorPoint[], id: string): AnchorPoint[] {
  return points.filter((p) => p.id !== id);
}

/**
 * Patch one anchor's SHAPE-STRUCTURE fields in one point set: the `smooth` flag
 * and/or handle deltas. `undefined` leaves a field as-is; `null` REMOVES a
 * handle. Used for the Alt-break flag propagation (flag everywhere, handle
 * VALUES stay per-keyframe) and for streaming the Ctrl-drag smooth insert's
 * handles into every set.
 */
export interface AnchorShapePatch {
  smooth?: boolean;
  in?: { x: number; y: number } | null;
  out?: { x: number; y: number } | null;
}

export function patchAnchorShape(
  points: readonly AnchorPoint[],
  id: string,
  patch: AnchorShapePatch,
): AnchorPoint[] {
  return points.map((p) => {
    if (p.id !== id) return p;
    const next: AnchorPoint = { ...p };
    if (patch.smooth !== undefined) next.smooth = patch.smooth;
    if (patch.in !== undefined) {
      if (patch.in === null) delete next.in;
      else next.in = { ...patch.in };
    }
    if (patch.out !== undefined) {
      if (patch.out === null) delete next.out;
      else next.out = { ...patch.out };
    }
    return next;
  });
}
