import type { Layer } from '@cg/shared-schema';
import { effectiveTransformAt } from '../timeline/keyframe-helpers.js';

export interface GroupMoveTargets {
  /** Selected, existing, visible & unlocked members with their start positions. */
  movers: { id: string; x: number; y: number }[];
  /** The grabbed anchor's start position + effective size (for snapping). */
  anchor: { x: number; y: number; w: number; h: number } | null;
  /** Snap targets from NON-selected elements (edges + centres), scene coords. */
  xTargets: number[];
  yTargets: number[];
}

/**
 * Partition the active document for a group move (D-041): the MOVABLE members
 * (selected, visible, unlocked) with their start positions, the grabbed
 * anchor's start + effective size, and the NON-selected elements' snap targets
 * (canvas edges/centre are seeded). Pure given the layers + selection; the
 * gesture in `CanvasOverlay` drives the per-tick deltas and applies them with
 * the keyframe-free base write. Locked/hidden members are skipped so they don't
 * move, consistent with single-element drag.
 */
export function collectGroupMoveTargets(
  layers: readonly Layer[],
  selection: ReadonlySet<string>,
  anchorId: string,
  currentFrame: number,
  resolution: { width: number; height: number },
): GroupMoveTargets {
  const movers: { id: string; x: number; y: number }[] = [];
  let anchor: GroupMoveTargets['anchor'] = null;
  const xTargets: number[] = [0, resolution.width / 2, resolution.width];
  const yTargets: number[] = [0, resolution.height / 2, resolution.height];
  for (const layer of layers) {
    for (const el of layer.children) {
      const t = effectiveTransformAt(el, currentFrame);
      const ew = t.size.w * t.scale.x;
      const eh = t.size.h * t.scale.y;
      if (selection.has(el.id)) {
        if (el.id === anchorId) anchor = { x: t.position.x, y: t.position.y, w: ew, h: eh };
        if (el.visible && !el.locked) {
          movers.push({ id: el.id, x: t.position.x, y: t.position.y });
        }
      } else {
        xTargets.push(t.position.x, t.position.x + ew / 2, t.position.x + ew);
        yTargets.push(t.position.y, t.position.y + eh / 2, t.position.y + eh);
      }
    }
  }
  return { movers, anchor, xTargets, yTargets };
}
