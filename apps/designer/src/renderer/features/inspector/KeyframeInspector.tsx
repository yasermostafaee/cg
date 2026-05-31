import type {
  AnimatableProperty,
  Easing,
  Element as SceneElement,
  Keyframe,
  Scene,
} from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { TIMELINE_ROWS } from '../timeline/keyframe-helpers.js';
import { NumberField, SelectField } from './controls.js';

interface Props {
  scene: Scene;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number };
}

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  headingFirst: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  heading: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: '0.4rem 0 0.2rem',
    paddingTop: '0.4rem',
    borderTop: `1px solid ${colors.border}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    gap: '0.5rem',
    fontSize: '0.82rem',
    padding: '0.15rem 0',
  },
  label: { color: colors.textMuted },
  value: { color: colors.text, fontWeight: 500 },
  removeButton: {
    background: 'transparent',
    color: '#fda4af',
    border: `1px solid ${colors.border}`,
    padding: '0.2rem 0.5rem',
    borderRadius: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    alignSelf: 'flex-start' as const,
    marginTop: '0.3rem',
  },
} as const;

const EASINGS: readonly Easing[] = ['linear', 'step', 'ease-in', 'ease-out', 'ease-in-out'];

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
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.headingFirst}>KEYFRAME</h2>
        <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          The selected keyframe is no longer available.
        </p>
      </aside>
    );
  }

  return (
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.headingFirst}>KEYFRAME — {rowLabel.toUpperCase()}</h2>
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
      <SelectField<Easing>
        label="easing"
        value={keyframe.easing}
        options={EASINGS}
        onCommit={(e) => designerStore.setKeyframeEasing(elementId, property, frame, e)}
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
    return <NumberField label="value" value={keyframe.value} step={0.1} onCommit={onCommit} />;
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
