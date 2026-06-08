import type { Element } from '@cg/shared-schema';

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
  return local.x >= 0 && local.x <= size.w && local.y >= 0 && local.y <= size.h;
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
