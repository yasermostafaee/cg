import type { Element, PathElement } from '@cg/shared-schema';
import { pathBBox } from '@cg/shared-schema';

interface Pt {
  x: number;
  y: number;
}

/**
 * Click-position hit-test against an element's transform. Works in
 * SCENE coordinates (pre-zoom). The canvas overlay converts a viewport
 * (mouse) coordinate via the active zoom factor before calling in.
 *
 * The renderer transforms each element with `scale(...) rotate(...)` about
 * its `anchor` (CSS `transform-origin`, a 0..1 fraction of the unscaled box;
 * see template-runtime/scene-builder). So a non-centre anchor — new elements
 * default to top-left `{0,0}` — swings the box around that corner. We invert
 * the *same* transform here: the forward map is `Scale·Rotate`, so we undo
 * scale then rotation about the anchor pivot, then bounds-test the resulting
 * point against the element's unscaled local box. (Skew is not hit-tested.)
 */
/**
 * Invert the element's `Scale·Rotate`-about-anchor transform and return the point
 * in the element's **unscaled local box** (origin at `position`, spanning
 * `0..size.w × 0..size.h`), or `null` when the element has a zero scale. This is
 * the shared core of {@link hitsElement} (which bounds-tests the result) and of
 * drilling into a nested composition (which maps the local box into the child's
 * coordinate space).
 */
export function inverseToLocal(
  element: Element,
  scenePoint: { x: number; y: number },
): { x: number; y: number } | null {
  const { position, size, rotation, anchor, scale } = element.transform;
  if (scale.x === 0 || scale.y === 0) return null;

  // Pivot in scene coords — the anchor point of the unscaled box at `position`.
  const pivotX = position.x + anchor.x * size.w;
  const pivotY = position.y + anchor.y * size.h;

  // Offset from the pivot, then invert Scale, then invert Rotate.
  let dx = (scenePoint.x - pivotX) / scale.x;
  let dy = (scenePoint.y - pivotY) / scale.y;
  if (rotation !== 0) {
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    dx = rx;
    dy = ry;
  }

  // Back to a point in the unscaled local box (relative to `position`).
  return { x: anchor.x * size.w + dx, y: anchor.y * size.h + dy };
}

export function hitsElement(element: Element, scenePoint: { x: number; y: number }): boolean {
  const local = inverseToLocal(element, scenePoint);
  if (local === null) return false;
  const { size } = element.transform;
  // D-109 — a path hits its ACTUAL outline (point-in-polygon when closed + a
  // stroke grab margin), not just its bounding box: a click inside the bbox but
  // outside the shape does NOT select it.
  if (element.type === 'path') return hitsPath(element, local, size.w, size.h);
  return local.x >= 0 && local.x <= size.w && local.y >= 0 && local.y <= size.h;
}

/**
 * D-109 — hit-test a path. The click arrives in the element's unscaled box space
 * (`local`, `0..size`); map it into the points' bbox space (so a RESIZED path,
 * whose `size` ≠ its points bbox because the viewBox rescales, still hits), then:
 * a CLOSED path hits its filled interior (ray-cast point-in-polygon over the
 * anchors) OR its outline; an OPEN path hits within a grab margin of its stroke.
 */
function hitsPath(el: PathElement, local: Pt, sizeW: number, sizeH: number): boolean {
  const pts = el.points;
  if (pts.length < 2) return false;
  // Project the points into the same DISPLAY space as `local` (the unscaled box,
  // `0..size`): the runtime viewBox maps the points' bbox onto the box, so display =
  // (point − bbox.min) · (size / bbox.extent). A degenerate axis (bbox.extent 0 — a
  // straight horizontal/vertical line) collapses to 0, which is correct: all points
  // share that coordinate, so distance is measured purely in the other axis.
  const bbox = pathBBox(pts);
  const fx = bbox.w === 0 ? 0 : sizeW / bbox.w;
  const fy = bbox.h === 0 ? 0 : sizeH / bbox.h;
  const poly: Pt[] = pts.map((p) => ({ x: (p.x - bbox.x) * fx, y: (p.y - bbox.y) * fy }));
  if (el.closed && pointInPolygon(local, poly)) return true;
  const tol = (el.stroke?.width ?? 0) / 2 + 6; // grab margin in display px
  const segCount = el.closed ? poly.length : poly.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a !== undefined && b !== undefined && distToSegment(local, a, b) <= tol) return true;
  }
  return false;
}

/** Ray-cast point-in-polygon over a list of {x,y} vertices. */
function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi === undefined || pj === undefined) continue;
    if (pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from point `p` to the segment `a`–`b`. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Find the topmost element under `scenePoint`. Topmost = last in
 * iteration order. Caller iterates layers + children left-to-right and
 * picks the last hit so visually-higher elements take precedence.
 */
export function topmostHit(
  elements: readonly Element[],
  scenePoint: { x: number; y: number },
): Element | null {
  let last: Element | null = null;
  for (const el of elements) {
    if (!el.visible || el.locked) continue;
    if (hitsElement(el, scenePoint)) last = el;
  }
  return last;
}
