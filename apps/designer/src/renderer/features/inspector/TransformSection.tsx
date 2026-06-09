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
import { RealtimeNumberInput, fieldScrub } from './controls.js';
import { cx } from '../../cx.js';
import * as s from './TransformSection.css.js';

interface Props {
  element: Element;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * Compact Loopic-style transform inspector. Each row is one or two cells
 * styled like a chip — single-letter / arrow / glyph "icon" labels (X, Y,
 * W, H, ↔, ↕, ↻, %) — followed by a small KeyframeIndicator diamond. The
 * 8 M12 animatable properties commit through `commitAnimatable` so an
 * edit at any frame on an animated property lands as a keyframe at the
 * current frame.
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

  return (
    <div className={s.col}>
      {/* Position X/Y — one combined field, each axis editable separately. */}
      <div className="cg-input-group">
        <Seg
          icon="X"
          ariaLabel="X position"
          value={t.position.x}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'position.x', v)}
          point={indicatorFor('position.x')}
        />
        <Seg
          icon="Y"
          ariaLabel="Y position"
          value={t.position.y}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'position.y', v)}
          point={indicatorFor('position.y')}
        />
      </div>
      {/* Size W/H */}
      <div className="cg-input-group">
        <Seg
          icon="W"
          ariaLabel="Width"
          value={t.size.w}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'size.w', v)}
          point={indicatorFor('size.w')}
        />
        <Seg
          icon="H"
          ariaLabel="Height"
          value={t.size.h}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'size.h', v)}
          point={indicatorFor('size.h')}
        />
      </div>
      {/* Scale X/Y (percent) */}
      <div className="cg-input-group">
        <Seg
          icon="↔"
          ariaLabel="Scale X"
          value={percent(t.scale.x)}
          suffix="%"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'scale.x', v / 100)}
          point={indicatorFor('scale.x')}
        />
        <Seg
          icon="↕"
          ariaLabel="Scale Y"
          value={percent(t.scale.y)}
          suffix="%"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'scale.y', v / 100)}
          point={indicatorFor('scale.y')}
        />
      </div>
      {/* Rotation (degrees) — single field, diamond outside the border. */}
      <SingleField
        icon="↻"
        ariaLabel="Rotation"
        value={Math.round(t.rotation * 100) / 100}
        suffix="°"
        step={1}
        onCommit={(v) => designerStore.commitAnimatable(id, 'rotation', v)}
        point={indicatorFor('rotation')}
      />
      {/* Opacity (percent) — single field, diamond outside the border. */}
      <SingleField
        icon="◑"
        ariaLabel="Opacity"
        value={percent(opacity)}
        suffix="%"
        step={1}
        min={0}
        max={100}
        onCommit={(v) => designerStore.commitAnimatable(id, 'opacity', clamp01(v / 100))}
        point={indicatorFor('opacity')}
      />
    </div>
  );
}

interface FieldProps {
  icon: string;
  ariaLabel: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (n: number) => void;
  /** Keyframe diamond for this property. */
  point: JSX.Element;
}

/**
 * Icon + scrubbable number + optional unit. When a unit is present the
 * input sizes to its content (.cg-num-unit → field-sizing: content) so the
 * unit hugs the value on the LEFT, next to the icon, rather than drifting
 * to the far edge of a full-width input.
 */
function FieldBody(props: FieldProps): JSX.Element {
  const hasUnit = props.suffix !== undefined;
  return (
    <>
      <span className={s.icon} aria-hidden>
        {props.icon}
      </span>
      <RealtimeNumberInput
        value={props.value}
        onCommit={props.onCommit}
        step={props.step}
        min={props.min}
        max={props.max}
        scrub={false}
        className={cx(hasUnit ? s.inputUnit : s.input, hasUnit && 'cg-num-unit')}
        ariaLabel={props.ariaLabel}
      />
      {hasUnit && <span className="cg-unit">{props.suffix}</span>}
    </>
  );
}

/** One axis of a combined vector field — the whole segment scrubs the value;
 *  diamond at the segment's right edge. */
function Seg(props: FieldProps): JSX.Element {
  const scrub = fieldScrub(props);
  return (
    <div className={cx('cg-seg', s.scrubSurface)} onPointerDown={scrub.onPointerDown}>
      <FieldBody {...props} />
      <span className={s.point}>{props.point}</span>
    </div>
  );
}

/** Standalone field — icon, value+unit on the left, diamond at the right,
 *  all inside one bordered box; the whole box scrubs the value. */
function SingleField(props: FieldProps): JSX.Element {
  const scrub = fieldScrub(props);
  return (
    <div className={cx('cg-field', s.scrubSurface)} onPointerDown={scrub.onPointerDown}>
      <FieldBody {...props} />
      <span className={s.point}>{props.point}</span>
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

function percent(scaleOrOpacity: number): number {
  return Math.round(scaleOrOpacity * 100);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
