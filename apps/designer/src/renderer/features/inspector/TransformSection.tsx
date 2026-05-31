import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import {
  KeyframeIndicator,
  type KeyframeIndicatorVariant,
} from '../timeline/KeyframeIndicator.js';
import { TIMELINE_ROWS, hasKeyframeAt, keyframeVariantFor } from '../timeline/keyframe-helpers.js';
import { NumberField, NumberPairField } from './controls.js';

interface Props {
  element: Element;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * Transform inspector. The eight M12 animatable properties (position x/y,
 * scale x/y, rotation, size w/h, opacity) flow through `commitAnimatable`
 * so that an edit at any frame on an animated property lands as a
 * keyframe at the current frame. A small diamond indicator to the right
 * of each row reflects the track / keyframe state for that property and
 * lights yellow when the matching point is selected in the timeline.
 * Non-animatable controls (z-index) keep their plain mutators.
 */
export function TransformSection({ element, currentFrame, selectedKeyframe }: Props): JSX.Element {
  const t = element.transform;
  const id = element.id;

  function indicatorFor(property: AnimatableProperty): JSX.Element {
    return (
      <KeyframeIndicator
        variant={keyframeVariantFor(element, property, currentFrame, selectedKeyframe)}
        onClick={() => toggleKeyframeForProperty(element, property, currentFrame)}
        ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)}`}
      />
    );
  }

  function paired(propX: AnimatableProperty, propY: AnimatableProperty): JSX.Element {
    const variant = combineVariants(
      keyframeVariantFor(element, propX, currentFrame, selectedKeyframe),
      keyframeVariantFor(element, propY, currentFrame, selectedKeyframe),
    );
    return (
      <KeyframeIndicator
        variant={variant}
        onClick={() => {
          toggleKeyframeForProperty(element, propX, currentFrame);
          toggleKeyframeForProperty(element, propY, currentFrame);
        }}
        ariaLabel={`Toggle keyframe for ${propX}/${propY} at frame ${String(currentFrame)}`}
      />
    );
  }

  return (
    <>
      <NumberPairField
        label="position"
        x={t.position.x}
        y={t.position.y}
        onCommit={(x, y) => {
          designerStore.commitAnimatable(id, 'position.x', x);
          designerStore.commitAnimatable(id, 'position.y', y);
        }}
        trailing={paired('position.x', 'position.y')}
      />
      <NumberPairField
        label="size"
        x={t.size.w}
        y={t.size.h}
        onCommit={(w, h) => {
          designerStore.commitAnimatable(id, 'size.w', w);
          designerStore.commitAnimatable(id, 'size.h', h);
        }}
        trailing={paired('size.w', 'size.h')}
      />
      <NumberField
        label="rotation"
        value={t.rotation}
        step={1}
        onCommit={(rotation) => designerStore.commitAnimatable(id, 'rotation', rotation)}
        trailing={indicatorFor('rotation')}
      />
      <NumberPairField
        label="scale"
        x={t.scale.x}
        y={t.scale.y}
        step={0.1}
        onCommit={(x, y) => {
          designerStore.commitAnimatable(id, 'scale.x', x);
          designerStore.commitAnimatable(id, 'scale.y', y);
        }}
        trailing={paired('scale.x', 'scale.y')}
      />
      <NumberField
        label="opacity"
        value={element.opacity}
        step={0.05}
        min={0}
        max={1}
        onCommit={(opacity) => designerStore.commitAnimatable(id, 'opacity', opacity)}
        trailing={indicatorFor('opacity')}
      />
      <NumberField
        label="z-index"
        value={element.zIndex}
        step={1}
        onCommit={(zIndex) => designerStore.updateElement(id, { zIndex } as Partial<Element>)}
      />
    </>
  );
}

/**
 * Indicator click toggles a keyframe at the current frame:
 *   - no keyframe here → adds one using the current static / interpolated
 *     value (read from the TIMELINE_ROWS catalogue).
 *   - keyframe here     → removes it (mirrors the Loopic UX).
 */
function toggleKeyframeForProperty(
  element: Element,
  property: AnimatableProperty,
  frame: number,
): void {
  if (hasKeyframeAt(element, property, frame)) {
    designerStore.removeKeyframe(element.id, property, frame);
    return;
  }
  const row = TIMELINE_ROWS.find((r) => r.property === property);
  if (row === undefined) return;
  const value = row.read(element);
  designerStore.upsertKeyframe(element.id, property, frame, value);
}

/**
 * For paired rows (X + Y, W + H, scaleX + scaleY) we render one diamond
 * per row whose variant is the "highest priority" of the two axes:
 * selected > at-frame > has-track > empty.
 */
function combineVariants(
  a: KeyframeIndicatorVariant,
  b: KeyframeIndicatorVariant,
): KeyframeIndicatorVariant {
  const rank: Record<KeyframeIndicatorVariant, number> = {
    empty: 0,
    'has-track': 1,
    'at-frame': 2,
    selected: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}
