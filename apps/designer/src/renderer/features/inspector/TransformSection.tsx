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
import { RealtimeNumberInput } from './controls.js';

interface Props {
  element: Element;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

const styles = {
  // D-010-pic-5: per-axis diamonds live INSIDE the cell now — each
  // cell is icon | input | ◆.
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.3rem',
    alignItems: 'center',
    padding: '0.1rem 0',
  },
  rowSingle: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '0.3rem',
    alignItems: 'center',
    padding: '0.1rem 0',
  },
  cell: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '0.25rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.05rem 0.3rem',
    minWidth: 0,
  },
  icon: {
    color: colors.textMuted,
    fontSize: '0.65rem',
    fontWeight: 600,
    width: 12,
    textAlign: 'center' as const,
  },
  input: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: '0.1rem 0',
    fontSize: '0.72rem',
    width: '100%',
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
    <>
      <div style={styles.row}>
        <Cell
          icon="X"
          value={t.position.x}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'position.x', v)}
          trailing={indicatorFor('position.x')}
        />
        <Cell
          icon="Y"
          value={t.position.y}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'position.y', v)}
          trailing={indicatorFor('position.y')}
        />
      </div>
      <div style={styles.row}>
        <Cell
          icon="W"
          value={t.size.w}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'size.w', v)}
          trailing={indicatorFor('size.w')}
        />
        <Cell
          icon="H"
          value={t.size.h}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'size.h', v)}
          trailing={indicatorFor('size.h')}
        />
      </div>
      <div style={styles.row}>
        <Cell
          icon="↔"
          value={percent(t.scale.x)}
          suffix="%"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'scale.x', v / 100)}
          trailing={indicatorFor('scale.x')}
        />
        <Cell
          icon="↕"
          value={percent(t.scale.y)}
          suffix="%"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'scale.y', v / 100)}
          trailing={indicatorFor('scale.y')}
        />
      </div>
      <div style={styles.rowSingle}>
        <Cell
          icon="↻"
          value={Math.round(t.rotation * 100) / 100}
          suffix="°"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'rotation', v)}
          trailing={indicatorFor('rotation')}
        />
      </div>
      <div style={styles.rowSingle}>
        <Cell
          icon="%"
          value={percent(opacity)}
          suffix="%"
          step={1}
          min={0}
          max={100}
          onCommit={(v) => designerStore.commitAnimatable(id, 'opacity', clamp01(v / 100))}
          trailing={indicatorFor('opacity')}
        />
      </div>
    </>
  );
}

interface CellProps {
  icon: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (n: number) => void;
  trailing?: JSX.Element;
}

function Cell({ icon, value, step, min, max, onCommit, trailing }: CellProps): JSX.Element {
  return (
    <div style={styles.cell}>
      <span style={styles.icon} aria-hidden>
        {icon}
      </span>
      <RealtimeNumberInput
        value={value}
        onCommit={onCommit}
        step={step}
        min={min}
        max={max}
        style={styles.input}
        ariaLabel={icon}
      />
      {trailing}
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
