import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { isKeyframeable, readStaticValue } from './field-registry.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
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
