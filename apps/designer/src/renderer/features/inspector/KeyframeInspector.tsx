import {
  EASING_PRESETS,
  type AnimatableProperty,
  type BezierEasing,
  type Element as SceneElement,
  type Keyframe,
  type Scene,
} from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { TIMELINE_ROWS } from '../timeline/keyframe-helpers.js';
import { NumberField } from './controls.js';
import { EasingEditor } from './EasingEditor.js';

interface Props {
  scene: Scene;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number };
}

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.3rem',
    minHeight: 0,
    overflowY: 'auto' as const,
    fontSize: '0.74rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.4rem',
  },
  headingFirst: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    margin: 0,
  },
  heading: {
    fontSize: '0.66rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    margin: '0.35rem 0 0.15rem',
    paddingTop: '0.35rem',
    borderTop: `1px solid ${colors.border}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    gap: '0.4rem',
    fontSize: '0.72rem',
    padding: '0.1rem 0',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem' },
  value: { color: colors.text, fontWeight: 500 },
  removeButton: {
    background: 'transparent',
    color: '#fda4af',
    border: `1px solid ${colors.border}`,
    padding: '0.15rem 0.4rem',
    borderRadius: '0.18rem',
    cursor: 'pointer',
    fontSize: '0.7rem',
    alignSelf: 'flex-start' as const,
    marginTop: '0.3rem',
  },
  closeButton: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.1rem 0.35rem',
    borderRadius: '0.18rem',
    cursor: 'pointer',
    fontSize: '0.68rem',
  },
} as const;

/**
 * The bézier to show in the easing editor: the keyframe's custom curve when set,
 * otherwise the preset matching its named easing (step falls back to linear).
 */
function effectiveBezier(keyframe: Keyframe): BezierEasing {
  if (keyframe.bezier !== undefined) return keyframe.bezier;
  return EASING_PRESETS[keyframe.easing] ?? EASING_PRESETS.linear ?? [0, 0, 1, 1];
}

/**
 * Right-side inspector for the selected keyframe. Activates when the
 * operator clicks a diamond in the timeline; shows the keyframe's frame,
 * value, easing, and a Remove button.
 */
export function KeyframeInspector({ scene, selectedKeyframe }: Props): JSX.Element {
  const { elementId, property, frame } = selectedKeyframe;
  const element = findElement(scene, elementId);
  const keyframe = element?.animation?.tracks[property]?.keyframes.find((k) => k.frame === frame);
  const rowLabel =
    TIMELINE_ROWS.find((r) => r.property === property)?.label ?? (property as string);

  if (element === null || keyframe === undefined) {
    return (
      <aside style={styles.panel} aria-label="Inspector" data-keyframe-inspector>
        <div style={styles.topRow}>
          <h2 style={styles.headingFirst}>KEYFRAME</h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={() => designerStore.closeKeyframeInspector()}
            aria-label="Back to element inspector"
          >
            ← back
          </button>
        </div>
        <p style={{ color: colors.textMuted, fontSize: '0.74rem' }}>
          The selected keyframe is no longer available.
        </p>
      </aside>
    );
  }

  return (
    <aside style={styles.panel} aria-label="Inspector" data-keyframe-inspector>
      <div style={styles.topRow}>
        <h2 style={styles.headingFirst}>KEYFRAME — {rowLabel.toUpperCase()}</h2>
        <button
          type="button"
          style={styles.closeButton}
          onClick={() => designerStore.closeKeyframeInspector()}
          aria-label="Back to element inspector"
        >
          ← back
        </button>
      </div>
      <StaticRow label="element" value={element.name} />
      <StaticRow label="property" value={property} />
      <h3 style={styles.heading}>POINT</h3>
      <NumberField
        label="frame"
        value={keyframe.frame}
        step={1}
        min={scene.frameRange.in}
        max={scene.frameRange.out}
        onCommit={(nextFrame) => {
          const clamped = Math.max(
            scene.frameRange.in,
            Math.min(scene.frameRange.out, Math.round(nextFrame)),
          );
          if (clamped === frame) return;
          designerStore.moveKeyframe(elementId, property, frame, clamped);
        }}
      />
      <KeyframeValueField
        keyframe={keyframe}
        onCommit={(value) => designerStore.setKeyframeValue(elementId, property, frame, value)}
      />
      <EasingEditor
        bezier={effectiveBezier(keyframe)}
        onChange={(b) => designerStore.setKeyframeBezier(elementId, property, frame, b)}
      />
      <button
        type="button"
        style={styles.removeButton}
        onClick={() => designerStore.removeKeyframe(elementId, property, frame)}
      >
        Remove keyframe
      </button>
    </aside>
  );
}

function KeyframeValueField({
  keyframe,
  onCommit,
}: {
  keyframe: Keyframe;
  onCommit: (value: number) => void;
}): JSX.Element {
  if (typeof keyframe.value === 'number') {
    return <NumberField label="value" value={keyframe.value} step={1} onCommit={onCommit} />;
  }
  // Color keyframes — not exposed in the v1 dock but render read-only.
  return (
    <div style={styles.row}>
      <span style={styles.label}>value</span>
      <span style={styles.value}>{keyframe.value}</span>
    </div>
  );
}

function StaticRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={styles.value}>{value}</span>
    </div>
  );
}

function findElement(scene: Scene, elementId: string): SceneElement | null {
  for (const layer of scene.layers) {
    for (const el of layer.children) {
      if (el.id === elementId) return el;
    }
  }
  return null;
}
