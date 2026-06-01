import type { AnimatableProperty, Element } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import { TIMELINE_ROWS, hasKeyframeAt, keyframeVariantFor } from '../timeline/keyframe-helpers.js';

interface Props {
  element: Element;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

const styles = {
  // D-009: per-axis diamonds — each cell gets its own indicator so X
  // can be yellow (keyframe at current frame) independently of Y.
  // Layout: [cell] [◆] [cell] [◆].
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 14px 1fr 14px',
    gap: '0.25rem',
    alignItems: 'center',
    padding: '0.1rem 0',
  },
  rowSingle: {
    display: 'grid',
    gridTemplateColumns: '1fr 14px',
    gap: '0.3rem',
    alignItems: 'center',
    padding: '0.1rem 0',
  },
  cell: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'center',
    gap: '0.25rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.05rem 0.3rem',
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
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  indicatorCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  const t = element.transform;
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
        />
        <span style={styles.indicatorCell}>{indicatorFor('position.x')}</span>
        <Cell
          icon="Y"
          value={t.position.y}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'position.y', v)}
        />
        <span style={styles.indicatorCell}>{indicatorFor('position.y')}</span>
      </div>
      <div style={styles.row}>
        <Cell
          icon="W"
          value={t.size.w}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'size.w', v)}
        />
        <span style={styles.indicatorCell}>{indicatorFor('size.w')}</span>
        <Cell
          icon="H"
          value={t.size.h}
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'size.h', v)}
        />
        <span style={styles.indicatorCell}>{indicatorFor('size.h')}</span>
      </div>
      <div style={styles.row}>
        <Cell
          icon="↔"
          value={percent(t.scale.x)}
          suffix="%"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'scale.x', v / 100)}
        />
        <span style={styles.indicatorCell}>{indicatorFor('scale.x')}</span>
        <Cell
          icon="↕"
          value={percent(t.scale.y)}
          suffix="%"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'scale.y', v / 100)}
        />
        <span style={styles.indicatorCell}>{indicatorFor('scale.y')}</span>
      </div>
      <div style={styles.rowSingle}>
        <Cell
          icon="↻"
          value={t.rotation}
          suffix="°"
          step={1}
          onCommit={(v) => designerStore.commitAnimatable(id, 'rotation', v)}
        />
        <span style={styles.indicatorCell}>{indicatorFor('rotation')}</span>
      </div>
      <div style={styles.rowSingle}>
        <Cell
          icon="%"
          value={percent(element.opacity)}
          suffix="%"
          step={1}
          min={0}
          max={100}
          onCommit={(v) => designerStore.commitAnimatable(id, 'opacity', clamp01(v / 100))}
        />
        <span style={styles.indicatorCell}>{indicatorFor('opacity')}</span>
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
}

function Cell({ icon, value, step, min, max, suffix, onCommit }: CellProps): JSX.Element {
  return (
    <div style={styles.cell}>
      <span style={styles.icon} aria-hidden>
        {icon}
      </span>
      <input
        style={styles.input}
        type="number"
        defaultValue={value}
        step={step}
        min={min}
        max={max}
        aria-label={icon}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        key={`${icon}-${String(value)}${suffix ?? ''}`}
      />
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
