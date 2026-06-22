import type { Layer } from '@cg/shared-schema';
import { effectiveTransformAt } from '../timeline/keyframe-helpers.js';
import { localToScene, type SceneAabb } from './geometry.js';

/**
 * D-071 — the scene-coordinate AABB of ALL elements currently visible on the active
 * composition, so {@link pasteboardLayout} can grow the pasteboard to contain off-frame
 * content. Mirrors the overlay's hit-test set (every top-level `layer.children`) at the
 * SAME CURRENT-FRAME transforms (`effectiveTransformAt`) the runtime renders — folding
 * each element's 4 corners through `Scale·Rotate-about-anchor` (`localToScene`).
 *
 * v1 scope (Q3): a nested composition INSTANCE contributes only its OWN box — we do NOT
 * recurse into its child elements (an instance is treated as a unit, exactly like the
 * overlay). Returns `null` when there is nothing on the canvas (empty / no layers),
 * which `pasteboardLayout` reads as "no growth" (the fixed 2× extent). On-frame-only
 * content yields a box inside the frame, so likewise nothing grows.
 */
export function contentBounds(layers: readonly Layer[], currentFrame: number): SceneAabb | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const layer of layers) {
    for (const el of layer.children) {
      const t = effectiveTransformAt(el, currentFrame);
      const { w, h } = t.size;
      const corners: readonly [number, number][] = [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ];
      for (const [lx, ly] of corners) {
        const p = localToScene(t, lx, ly);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue; // degenerate → skip
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
        any = true;
      }
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}
