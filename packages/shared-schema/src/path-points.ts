import { z } from 'zod';
import { IdSchema, Vec2Schema } from './primitives.js';

/**
 * D-109 — a Bézier anchor on a `path` element. `in`/`out` are the two control
 * handles expressed as DELTAS from the anchor (`{x,y}` offsets), so they stay
 * correct under the element transform and give D-110 a clean per-point morph
 * target. `smooth` records corner (independent handles) vs smooth (mirrored
 * pair) so the editor can re-mirror a handle on drag. `id` is a stable id (the
 * editor mints a nanoid) — the reconciliation key D-110 matches anchors by.
 *
 * Lives in its own leaf module (not `elements.ts`) because BOTH `elements.ts`
 * (the path element) and `animation.ts` (the D-110 path keyframe snapshot)
 * need it, and `elements.ts` already imports `animation.ts`.
 */
export const AnchorPointSchema = z.object({
  id: IdSchema,
  x: z.number(),
  y: z.number(),
  in: Vec2Schema.optional(),
  out: Vec2Schema.optional(),
  smooth: z.boolean(),
});
export type AnchorPoint = z.infer<typeof AnchorPointSchema>;

/**
 * D-110 — the keyframe value of the `path` animatable property: a SNAPSHOT of
 * the whole ordered anchor set in the element's local space (the same space
 * the static `points` live in — the local coordinate system stays FIXED while
 * the shape animates). The `kind` discriminant keeps every value-kind dispatch
 * explicit next to the `number` / hex-string variants.
 */
export const PathKeyframeValueSchema = z.object({
  kind: z.literal('path'),
  points: z.array(AnchorPointSchema).min(2),
});
export type PathKeyframeValue = z.infer<typeof PathKeyframeValueSchema>;

/** Narrow an unknown keyframe value to the D-110 path snapshot variant. */
export function isPathKeyframeValue(v: unknown): v is PathKeyframeValue {
  return typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'path';
}

/** Deep-copy a point list so a stored snapshot never aliases `element.points`. */
export function clonePathPoints(points: readonly AnchorPoint[]): AnchorPoint[] {
  return points.map((p) => ({
    ...p,
    ...(p.in !== undefined ? { in: { ...p.in } } : {}),
    ...(p.out !== undefined ? { out: { ...p.out } } : {}),
  }));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Lerp one handle delta pair. An ABSENT handle interpolates from/to the ZERO
 * vector — a zero-length handle is geometrically the straight segment (the
 * cubic's control point sits on the endpoint), so a corner↔smooth change
 * morphs smoothly instead of snapping. Both absent ⇒ stays absent.
 */
function lerpHandle(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
  t: number,
): { x: number; y: number } | undefined {
  if (a === undefined && b === undefined) return undefined;
  const ax = a?.x ?? 0;
  const ay = a?.y ?? 0;
  const bx = b?.x ?? 0;
  const by = b?.y ?? 0;
  return { x: lerp(ax, bx, t), y: lerp(ay, by, t) };
}

/**
 * D-110 — the SINGLE id-matched path-snapshot interpolator, shared by the
 * runtime evaluator (`@cg/template-runtime` `lerpValue`) and the Designer's
 * display-time mirror (`keyframe-helpers.ts`) the same way `cubicBezierEase`
 * is the single bézier sampler — one implementation, no drift. `t` arrives
 * ALREADY EASED (easing is applied upstream by the evaluator, exactly as for
 * numeric tracks).
 *
 * Rules (owner decisions 2026-07-10 + the Phase-1 fallback):
 *   - Result order = the LEADING snapshot `a`'s anchor order.
 *   - An id in BOTH snapshots tweens x/y and in/out handle deltas
 *     ({@link lerpHandle}); `smooth` copies from the leading anchor (editor
 *     metadata, not geometry).
 *   - An id ONLY in `a` is HELD at its leading value for the whole segment
 *     (the trailing snapshot takes over exactly ON the trailing keyframe's
 *     frame); an id ONLY in `b` is omitted until that frame. Deterministic and
 *     crash-free — smooth different-count morphing is Phase 2.
 */
export function lerpPathSnapshot(
  a: PathKeyframeValue,
  b: PathKeyframeValue,
  t: number,
): PathKeyframeValue {
  const byId = new Map(b.points.map((p) => [p.id, p]));
  const points: AnchorPoint[] = a.points.map((pa) => {
    const pb = byId.get(pa.id);
    if (pb === undefined) return { ...pa }; // leading-only id — held.
    const inH = lerpHandle(pa.in, pb.in, t);
    const outH = lerpHandle(pa.out, pb.out, t);
    return {
      id: pa.id,
      x: lerp(pa.x, pb.x, t),
      y: lerp(pa.y, pb.y, t),
      ...(inH !== undefined ? { in: inH } : {}),
      ...(outH !== undefined ? { out: outH } : {}),
      smooth: pa.smooth,
    };
  });
  return { kind: 'path', points };
}

const EPS = 1e-6;

const sameVec = (
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
): boolean => {
  const ax = a?.x ?? 0;
  const ay = a?.y ?? 0;
  const bx = b?.x ?? 0;
  const by = b?.y ?? 0;
  return Math.abs(ax - bx) < EPS && Math.abs(ay - by) < EPS;
};

/**
 * Structural equality of two path snapshots (id + coords + handle deltas with
 * a numeric epsilon; absent handle == zero vector, mirroring {@link
 * lerpPathSnapshot}). Used by the runtime's settle scan (`sameKeyframeValue`).
 */
export function pathKeyframeValuesEqual(a: PathKeyframeValue, b: PathKeyframeValue): boolean {
  if (a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i++) {
    const pa = a.points[i];
    const pb = b.points[i];
    if (pa === undefined || pb === undefined) return false;
    if (pa.id !== pb.id) return false;
    if (Math.abs(pa.x - pb.x) >= EPS || Math.abs(pa.y - pb.y) >= EPS) return false;
    if (!sameVec(pa.in, pb.in) || !sameVec(pa.out, pb.out)) return false;
  }
  return true;
}
