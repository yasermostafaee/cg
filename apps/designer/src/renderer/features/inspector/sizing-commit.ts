import type { Element, TextElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { measureElementSceneSize } from '../canvas/measure-element.js';

/**
 * D-046 — the sizing=auto guard. Switching a text element to Auto makes its box
 * content-driven, so any size keyframes (`size.w` / `size.h`) become meaningless
 * (the runtime ignores them). To never silently destroy data, the toggle warns +
 * confirms first (see `SizingAutoConfirmModal`); these helpers are the store side.
 *
 * Mirrors `fill-commit.ts` (B-014): a discrete mode change + a keyframe-track delete
 * applied as ONE undo step via `runAsSingleHistoryEntry`.
 */

/** True when the element has keyframes on its size track (mirrors `off-frame.ts` `hasGeometryAnimation`, narrowed to size). */
export function hasSizeKeyframes(el: Element): boolean {
  const tracks = el.animation?.tracks;
  if (tracks === undefined) return false;
  return tracks['size.w'] !== undefined || tracks['size.h'] !== undefined;
}

/**
 * Switch text element(s) to Auto, deleting their `size.w` / `size.h` keyframe tracks
 * as a SINGLE undo step (one Ctrl+Z restores both `fixed` and the keyframes). Safe for
 * one id or many (the multi-select aggregate); a no-size-keyframe element just flips.
 */
export function switchTextToAutoSize(ids: readonly string[]): void {
  designerStore.runAsSingleHistoryEntry(() => {
    for (const id of ids) {
      designerStore.updateElement(id, { fitMode: 'autosize' } as Partial<Element>);
      designerStore.clearKeyframeTrack(id, 'size.w');
      designerStore.clearKeyframeTrack(id, 'size.h');
    }
  });
}

/**
 * Switch a text element back to Fixed. D-046 §E — commit the CURRENT measured hug
 * size into `transform.size` ONCE at the transition so the box stays where the
 * operator sees it (no snap-back to the pre-Auto size). This is the single sanctioned
 * exception to §C's no-write-back rule — a discrete user action, one write, no loop.
 * Falls back to the existing `transform.size` when no measurement is available.
 */
export function switchTextToFixedSize(el: TextElement): void {
  const measured = measureElementSceneSize(el.id);
  const size = measured ?? el.transform.size;
  designerStore.updateElement(el.id, {
    fitMode: 'fixed',
    transform: { ...el.transform, size: { w: size.w, h: size.h } },
  } as Partial<Element>);
}
