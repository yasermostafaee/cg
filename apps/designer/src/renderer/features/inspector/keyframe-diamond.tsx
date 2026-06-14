import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { isKeyframeable, readStaticValue } from './field-registry.js';
import { KeyframeIndicator, type KeyframeIndicatorVariant } from '../timeline/KeyframeIndicator.js';
import {
  effectiveAnimatableValue,
  hasKeyframeAt,
  keyframeVariantFor,
} from '../timeline/keyframe-helpers.js';

type SelectedKeyframe = {
  elementId: string;
  property: AnimatableProperty;
  frame: number;
} | null;

/**
 * D-051 — the ONE keyframe-diamond affordance for the right inspector.
 *
 * Renders a real {@link KeyframeIndicator} IFF the central registry marks
 * `property` keyframe-able for THIS element instance ({@link isKeyframeable}), and
 * `undefined` (no glyph) otherwise — so a diamond appears exactly where the
 * property is animatable, with no disabled placeholder. This replaces the
 * per-section `animPointIcon` / `animPoint` (real) and `pointIcon` / `point`
 * (dead no-op) helpers, and guarantees right/left parity because the timeline-left
 * reads the same registry.
 *
 * Clicking toggles a keyframe at the playhead: it removes an existing one, else it
 * captures the EVALUATED value at the frame (B-005/B-006/B-007) with the registry's
 * static `read` as the fallback.
 */
export function KeyframeDot(
  element: Element,
  property: AnimatableProperty,
  currentFrame: number,
  selectedKeyframe: SelectedKeyframe,
): JSX.Element | undefined {
  if (!isKeyframeable(element, property)) return undefined;
  const variant = keyframeVariantFor(element, property, currentFrame, selectedKeyframe);
  return (
    <KeyframeIndicator
      variant={variant}
      onClick={() => toggleKeyframeAt(element, property, currentFrame)}
      ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)}`}
    />
  );
}

/**
 * Toggle a keyframe for `property` at `frame` from a diamond click. Captures the
 * EVALUATED value at the playhead (not the static base) so adding a keyframe past
 * an existing one holds the animated value instead of reverting it (B-005/B-006).
 */
export function toggleKeyframeAt(
  element: Element,
  property: AnimatableProperty,
  frame: number,
): void {
  if (hasKeyframeAt(element, property, frame)) {
    designerStore.removeKeyframe(element.id, property, frame);
    return;
  }
  const fallback = readStaticValue(element, property, 0);
  const value = effectiveAnimatableValue(element, property, frame, fallback);
  designerStore.upsertKeyframe(element.id, property, frame, value);
}

/**
 * D-054 — the AGGREGATE keyframe state for a property across a multi-selection at
 * `frame`: `at-frame` when EVERY element has a keyframe there, `empty` when none,
 * `partial` otherwise. Computed over the passed elements (the caller gates presence
 * on `isKeyframeable` for all selected).
 */
export function aggregateKeyframeVariant(
  elements: readonly Element[],
  property: AnimatableProperty,
  frame: number,
): KeyframeIndicatorVariant {
  if (elements.length === 0) return 'empty';
  let at = 0;
  for (const el of elements) if (hasKeyframeAt(el, property, frame)) at += 1;
  if (at === 0) return 'empty';
  if (at === elements.length) return 'at-frame';
  return 'partial';
}

/**
 * D-054 — toggle a keyframe for `property` at `frame` across the WHOLE selection as
 * ONE undo entry: when every element already has a keyframe there, remove it from
 * all; otherwise ADD one to every element that lacks one, capturing each element's
 * evaluated-at-playhead value (B-005-safe — the same capture {@link toggleKeyframeAt}
 * uses). Reuses removeKeyframe/upsertKeyframe; no shared helper is modified.
 */
export function toggleGroupKeyframe(
  elements: readonly Element[],
  property: AnimatableProperty,
  frame: number,
): void {
  if (elements.length === 0) return;
  const allHave = elements.every((el) => hasKeyframeAt(el, property, frame));
  designerStore.runAsSingleHistoryEntry(() => {
    for (const el of elements) {
      if (allHave) {
        designerStore.removeKeyframe(el.id, property, frame);
      } else if (!hasKeyframeAt(el, property, frame)) {
        const fallback = readStaticValue(el, property, 0);
        const value = effectiveAnimatableValue(el, property, frame, fallback);
        designerStore.upsertKeyframe(el.id, property, frame, value);
      }
    }
  });
}

/**
 * D-054 — the multi-selection keyframe diamond for the right inspector. Rendered
 * IFF `property` is keyframe-able for EVERY selected element (the D-051 registry
 * rule, so a gradient fill or a kind that can't keyframe it hides the diamond),
 * showing the aggregate empty/at-frame/partial state and toggling keyframes across
 * the selection in one undo. Returns `undefined` (no glyph) when not shown.
 */
export function MultiKeyframeDot(
  elements: readonly Element[],
  property: AnimatableProperty,
  currentFrame: number,
): JSX.Element | undefined {
  if (elements.length === 0) return undefined;
  if (!elements.every((el) => isKeyframeable(el, property))) return undefined;
  const variant = aggregateKeyframeVariant(elements, property, currentFrame);
  return (
    <KeyframeIndicator
      variant={variant}
      onClick={() => toggleGroupKeyframe(elements, property, currentFrame)}
      ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)} across the selection`}
    />
  );
}
