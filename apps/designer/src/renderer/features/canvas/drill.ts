import type { Composition, Element } from '@cg/shared-schema';
import { effectiveTransformAt } from '../timeline/keyframe-helpers.js';
import { inverseToLocal, topmostHit } from './hit-test.js';

export interface DrillTarget {
  /** The child composition to open for editing. */
  compositionId: string;
  /** The child shape under the cursor to select, or `null` for empty child space. */
  shapeId: string | null;
}

/**
 * Double-click drill (D-024): given a composition **instance** element (at its
 * effective transform for the current frame) and the resolved child
 * {@link Composition} definition, map the scene-space `scenePoint` into the child's
 * own coordinate space and find the topmost child shape under it.
 *
 * The runtime renders the child's contents scaled to fill the instance box
 * (`scale = instance.size / child.resolution`, see template-runtime/scene-builder),
 * so we invert the instance's transform to a point in its unscaled local box, then
 * scale that into the child's resolution. Returns the child id to open + the shape
 * id to select (null when the click lands on empty child space); `null` overall
 * only when the instance isn't a composition or has a degenerate size/scale.
 *
 * One call drills exactly one level — if the child shape under the cursor is itself
 * a nested composition it's simply selected as a unit, and the next double-click
 * drills into it.
 */
export function drillTarget(
  instance: Element,
  child: Composition,
  scenePoint: { x: number; y: number },
  currentFrame: number,
): DrillTarget | null {
  if (instance.type !== 'composition') return null;
  const local = inverseToLocal(instance, scenePoint);
  if (local === null) return null;
  const { size } = instance.transform;
  if (size.w === 0 || size.h === 0) return null;

  // Local box (0..size) → the child's own resolution space.
  const childPoint = {
    x: (local.x * child.resolution.width) / size.w,
    y: (local.y * child.resolution.height) / size.h,
  };

  // Hit-test the child's top-level elements at their visually-effective transform
  // (nested animation plays along the parent timeline, so the same frame applies).
  const childElements: Element[] = [];
  for (const layer of child.layers) {
    for (const el of layer.children) {
      childElements.push({ ...el, transform: effectiveTransformAt(el, currentFrame) });
    }
  }
  const childHit = topmostHit(childElements, childPoint);
  return { compositionId: child.id, shapeId: childHit?.id ?? null };
}
