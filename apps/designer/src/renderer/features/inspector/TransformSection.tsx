import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import {
  TIMELINE_ROWS,
  effectiveAnimatableValue,
  effectiveOpacityAt,
  effectiveTransformAt,
  hasKeyframeAt,
  keyframeVariantFor,
} from '../timeline/keyframe-helpers.js';
import { Seg, SingleField, transformFieldProps } from './transform-fields.js';
import * as s from './TransformSection.css.js';

interface Props {
  element: Element;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * Compact Loopic-style transform inspector. Each row is one or two cells styled
 * like a chip — single-letter / arrow / glyph "icon" labels (X, Y, W, H, ↔, ↕,
 * ↻, ◑) — followed by a small KeyframeIndicator diamond. The field primitives +
 * per-property display metadata (icon / unit / stored↔shown conversion) live in
 * `transform-fields.tsx` and are SHARED with the multi-selection editor (D-049).
 * The 8 animatable properties commit through `commitAnimatable` so an edit at
 * any frame on an animated property lands as a keyframe at the current frame.
 */
export function TransformSection({ element, selectedKeyframe }: Props): JSX.Element {
  // Self-subscribe to the frame so only this value-bearing section re-renders
  // during playback, not the whole inspector.
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  // Show the *effective* values at the current frame so editing a keyframe (or
  // scrubbing) updates these fields in lock-step with the canvas, not the
  // element's frozen static transform.
  const t = effectiveTransformAt(element, currentFrame);
  const opacity = effectiveOpacityAt(element, currentFrame);
  const id = element.id;

  function indicatorFor(property: AnimatableProperty): JSX.Element {
    const variant = keyframeVariantFor(element, property, currentFrame, selectedKeyframe);
    return (
      <KeyframeIndicator
        variant={variant}
        onClick={() => togglePropertyKeyframe(element, property, currentFrame)}
        ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)}`}
      />
    );
  }

  // Commit a property's STORED value (the shared field props convert the
  // displayed value — e.g. opacity %, scale % — back to stored units).
  const commit =
    (property: AnimatableProperty) =>
    (v: number): void =>
      designerStore.commitAnimatable(id, property, v);

  return (
    <div className={s.col}>
      {/* Position X/Y — one combined field, each axis editable separately. */}
      <div className="cg-input-group">
        <Seg
          {...transformFieldProps('position.x', t.position.x, commit('position.x'))}
          point={indicatorFor('position.x')}
        />
        <Seg
          {...transformFieldProps('position.y', t.position.y, commit('position.y'))}
          point={indicatorFor('position.y')}
        />
      </div>
      {/* Size W/H */}
      <div className="cg-input-group">
        <Seg
          {...transformFieldProps('size.w', t.size.w, commit('size.w'))}
          point={indicatorFor('size.w')}
        />
        <Seg
          {...transformFieldProps('size.h', t.size.h, commit('size.h'))}
          point={indicatorFor('size.h')}
        />
      </div>
      {/* Scale X/Y (percent) */}
      <div className="cg-input-group">
        <Seg
          {...transformFieldProps('scale.x', t.scale.x, commit('scale.x'))}
          point={indicatorFor('scale.x')}
        />
        <Seg
          {...transformFieldProps('scale.y', t.scale.y, commit('scale.y'))}
          point={indicatorFor('scale.y')}
        />
      </div>
      {/* Rotation (degrees) — single field, diamond outside the border. */}
      <SingleField
        {...transformFieldProps('rotation', t.rotation, commit('rotation'))}
        point={indicatorFor('rotation')}
      />
      {/* Opacity (percent) — single field, diamond outside the border. */}
      <SingleField
        {...transformFieldProps('opacity', opacity, commit('opacity'))}
        point={indicatorFor('opacity')}
      />
    </div>
  );
}

/**
 * Toggle a keyframe for `property` at `frame` from a diamond click. Exported for
 * regression coverage (B-005): the added keyframe must capture the EVALUATED value
 * at the playhead, not the element's static base.
 */
export function togglePropertyKeyframe(
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
  // Capture the EVALUATED value at the playhead (what the field shows and the
  // canvas renders) — not the element's static base — so adding a keyframe past
  // an existing one holds the animated value instead of reverting it (B-005).
  const value = effectiveAnimatableValue(element, property, frame, row.read(element));
  designerStore.upsertKeyframe(element.id, property, frame, value);
}
