import type { Element, Layer, Transform } from '@cg/shared-schema';

export interface GroupMoveTargets {
  /** Selected, existing, visible & unlocked members with their start positions. */
  movers: { id: string; x: number; y: number }[];
  /** The grabbed anchor's start position + effective size (for snapping). */
  anchor: { x: number; y: number; w: number; h: number } | null;
  /** Snap targets from NON-selected elements (edges + centres), scene coords. */
  xTargets: number[];
  yTargets: number[];
  /**
   * B-027 — the combined AABB (scene coords) of the MOVABLE members at their start
   * positions, so a group drag/nudge can be clamped to the pasteboard (the whole group
   * box stays inside). `null` when nothing is movable.
   */
  box: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/**
 * Partition the active document for a group move (D-041): the MOVABLE members
 * (selected, visible, unlocked) with their start positions, the grabbed
 * anchor's start + effective size, and the NON-selected elements' snap targets
 * (canvas edges/centre are seeded). Pure given the layers + selection; the
 * gesture in `CanvasOverlay` drives the per-tick deltas and applies them with
 * the keyframe-free base write. Locked/hidden members are skipped so they don't
 * move, consistent with single-element drag.
 *
 * 🔴 **`B-175` — `transformAt` IS THE READ SIDE, AND IT IS A REQUIRED PARAMETER RATHER THAN
 * AN IMPORT.** This module read `effectiveTransformAt` directly, so a group move computed
 * every member's start position from its AUTHORED rect while the canvas drew it at its
 * arrangement CELL — the same fault as `beginResize`, on the multi-selection path.
 *
 * It is injected, not imported, because the sentence above this one says _"Pure given the
 * layers + selection"_ and the ONE read side (`renderedTransformAt`) reads the store. Making
 * this module store-coupled to fix a read bug would trade a stated contract for a silent one.
 *
 * ⚠ **Required, never defaulted.** A default is how the injection quietly becomes optional
 * and a new caller gets the authored rect back by omission — which is exactly the shape of
 * the defect being fixed. The type system asking the question at every call site IS the fix;
 * production passes `renderedTransformAt` from both doors.
 */
export function collectGroupMoveTargets(
  layers: readonly Layer[],
  selection: ReadonlySet<string>,
  anchorId: string,
  currentFrame: number,
  resolution: { width: number; height: number },
  transformAt: (el: Element, frame: number) => Transform,
): GroupMoveTargets {
  const movers: { id: string; x: number; y: number }[] = [];
  let anchor: GroupMoveTargets['anchor'] = null;
  const xTargets: number[] = [0, resolution.width / 2, resolution.width];
  const yTargets: number[] = [0, resolution.height / 2, resolution.height];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of layers) {
    for (const el of layer.children) {
      const t = transformAt(el, currentFrame);
      const ew = t.size.w * t.scale.x;
      const eh = t.size.h * t.scale.y;
      if (selection.has(el.id)) {
        if (el.id === anchorId) anchor = { x: t.position.x, y: t.position.y, w: ew, h: eh };
        if (el.visible && !el.locked) {
          movers.push({ id: el.id, x: t.position.x, y: t.position.y });
          // Accumulate the movable group's AABB (scaled box, axis-aligned).
          minX = Math.min(minX, t.position.x);
          minY = Math.min(minY, t.position.y);
          maxX = Math.max(maxX, t.position.x + ew);
          maxY = Math.max(maxY, t.position.y + eh);
        }
      } else {
        xTargets.push(t.position.x, t.position.x + ew / 2, t.position.x + ew);
        yTargets.push(t.position.y, t.position.y + eh / 2, t.position.y + eh);
      }
    }
  }
  const box = movers.length > 0 ? { minX, minY, maxX, maxY } : null;
  return { movers, anchor, xTargets, yTargets, box };
}
