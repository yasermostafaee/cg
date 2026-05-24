import type { Element } from '@cg/shared-schema';

/**
 * Click-position hit-test against an element's transform. Works in
 * SCENE coordinates (pre-scale). The canvas overlay converts a viewport
 * (mouse) coordinate via the active zoom factor before calling in.
 *
 * Rotation is honored — point is mapped back through the element's
 * inverse rotation around its center, then bounds-tested.
 */
export function hitsElement(element: Element, scenePoint: { x: number; y: number }): boolean {
  const { transform } = element;
  const { position, size, rotation } = transform;
  const w = size.w * transform.scale.x;
  const h = size.h * transform.scale.y;
  const cx = position.x + w / 2;
  const cy = position.y + h / 2;
  if (rotation === 0) {
    return (
      scenePoint.x >= position.x &&
      scenePoint.x <= position.x + w &&
      scenePoint.y >= position.y &&
      scenePoint.y <= position.y + h
    );
  }
  const rad = (-rotation * Math.PI) / 180;
  const dx = scenePoint.x - cx;
  const dy = scenePoint.y - cy;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2;
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
