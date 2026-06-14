import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { isKeyframeable } from './field-registry.js';

/**
 * B-014 — keep a colour property's keyframe track consistent with its fill mode.
 *
 * A colour is keyframe-able only while it is a SOLID fill (D-051's registry rule —
 * gradients can't interpolate, so the diamond disappears). When a fill/colour mode
 * change makes the property NON-keyframe-able, its keyframe track is now orphaned:
 * the diamond is gone but the runtime still animates the old track, overriding the
 * gradient. These helpers remove that track, driven by the SAME registry predicate
 * that hides the diamond ({@link isKeyframeable}) — never a parallel gradient check —
 * so the data and the UI agree.
 */

/**
 * Drop `property`'s keyframe track IF the (already-updated) element is no longer
 * keyframe-able for it. Call AFTER the fill write, INSIDE the caller's history entry,
 * passing the POST-change element so the predicate sees the new fill. No-op when the
 * property is still keyframe-able or has no track. Shared by the single-element
 * inspector and the multi-select editor.
 */
export function clearOrphanColourTrack(updated: Element, property: AnimatableProperty): void {
  if (!isKeyframeable(updated, property)) {
    designerStore.clearKeyframeTrack(updated.id, property);
  }
}

/**
 * Single-select fill-mode change: apply the fill `patch` and clear an orphaned colour
 * track as ONE undo step — so an accidental solid→gradient switch is recoverable
 * (undo restores both the mode AND the keyframes). The clear fires exactly when the
 * registry would hide the diamond; switching back to a keyframe-able mode (or a fill
 * with no track) leaves a single clean history entry with nothing removed.
 */
export function applyFillModeChange(
  element: Element,
  property: AnimatableProperty,
  patch: Partial<Element>,
): void {
  designerStore.runAsSingleHistoryEntry(() => {
    designerStore.updateElement(element.id, patch);
    clearOrphanColourTrack({ ...element, ...patch } as Element, property);
  });
}
