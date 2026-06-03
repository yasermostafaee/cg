import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import {
  TIMELINE_ROWS,
  effectiveOpacityAt,
  effectiveTransformAt,
  hasKeyframeAt,
  keyframeVariantFor,
} from '../timeline/keyframe-helpers.js';
import { RealtimeNumberInput, scrubHandle } from './controls.js';

interface Props {
  element: Element;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

const styles = {
  col: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    padding: '0.1rem 0',
  },
  icon: {
    color: colors.textMuted,
    fontSize: '0.65rem',
    fontWeight: 600,
    width: 12,
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  input: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: '0.1rem 0',
    fontSize: '0.72rem',
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
} as const;

/**
 * Compact Loopic-style transform inspector. Each row is one or two cells
 * styled like a chip — single-letter / arrow / glyph "icon" labels (X, Y,
 * W, H, ↔, ↕, ↻, %) — followed by a small KeyframeIndicator diamond. The
 * 8 M12 animatable properties commit through `commitAnimatable` so an
 * edit at any frame on an animated property lands as a keyframe at the
 * current frame.
 */
export function TransformSection({ element, currentFrame, selectedKeyframe }: Props): JSX.Element {
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
    <div style={styles.col}>
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

/** Icon + scrubbable number + optional unit. Shared by Seg and SingleField. */
function FieldBody(props: FieldProps): JSX.Element {
  const scrub = scrubHandle({
    value: props.value,
    onCommit: props.onCommit,
    step: props.step,
    min: props.min,
    max: props.max,
  });
  return (
    <>
      <span
        style={{ ...styles.icon, ...scrub.style }}
        onPointerDown={scrub.onPointerDown}
        title="Drag to adjust"
        aria-hidden
      >
        {props.icon}
      </span>
      <RealtimeNumberInput
        value={props.value}
        onCommit={props.onCommit}
        step={props.step}
        min={props.min}
        max={props.max}
        style={styles.input}
        ariaLabel={props.ariaLabel}
      />
      {props.suffix !== undefined && <span className="cg-unit">{props.suffix}</span>}
    </>
  );
}

/** One axis of a combined vector field — diamond sits INSIDE the segment. */
function Seg(props: FieldProps): JSX.Element {
  return (
    <div className="cg-seg">
      <FieldBody {...props} />
      {props.point}
    </div>
  );
}

/** Standalone field — diamond sits OUTSIDE the bordered box. */
function SingleField(props: FieldProps): JSX.Element {
  return (
    <div className="cg-field-row">
      <div className="cg-field">
        <FieldBody {...props} />
      </div>
      {props.point}
    </div>
  );
}

function togglePropertyKeyframe(
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
  designerStore.upsertKeyframe(element.id, property, frame, row.read(element));
}

function percent(scaleOrOpacity: number): number {
  return Math.round(scaleOrOpacity * 100);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
