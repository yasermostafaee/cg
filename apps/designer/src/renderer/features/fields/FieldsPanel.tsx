import type { DynamicField, FieldBinding, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { TextField } from '../inspector/controls.js';
import { describeBinding } from './bind-resolver.js';

interface Props {
  scene: Scene;
  bindModeFieldId: string | null;
}

const styles = {
  block: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.45rem',
  },
  empty: { color: colors.textMuted, fontSize: '0.82rem' },
  fieldCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
    padding: '0.4rem 0.5rem',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    background: colors.panelMuted,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  cardId: { fontSize: '0.78rem', color: colors.text, fontWeight: 600 },
  cardType: {
    fontSize: '0.7rem',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  cardActions: { display: 'flex', gap: '0.3rem' },
  smallButton: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.15rem 0.45rem',
    borderRadius: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.72rem',
  },
  smallButtonActive: {
    background: 'rgba(56,189,248,0.2)',
    color: '#e0f2fe',
    borderColor: 'rgba(56,189,248,0.6)',
  },
  bindList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.2rem',
    marginTop: '0.15rem',
  },
  bindRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.78rem',
    color: colors.text,
  },
  bindEmpty: { fontSize: '0.75rem', color: colors.textMuted, fontStyle: 'italic' as const },
} as const;

/**
 * Scene-level fields editor. Lives in the Inspector's SceneInspector
 * region (shown when no element is selected). Fields are the operator's
 * runtime payload contract; bindings wire them to elements.
 *
 * The "Bind from canvas" workflow:
 *   1. operator clicks Bind on a field → store.bindModeFieldId = fieldId
 *   2. canvas overlay (CanvasOverlay) picks up the next pointerdown
 *      and calls bind-resolver to produce a FieldBinding
 *   3. store.addBinding + store.setBindMode(null)
 *
 * Escape clears bind mode globally (handled in CanvasArea).
 */
export function FieldsPanel({ scene, bindModeFieldId }: Props): JSX.Element {
  return (
    <div style={styles.block}>
      {scene.fields.length === 0 ? (
        <p style={styles.empty}>No fields.</p>
      ) : (
        <div style={styles.list}>
          {scene.fields.map((f) => (
            <FieldCard
              key={f.id}
              field={f}
              bindings={scene.bindings}
              bindModeFieldId={bindModeFieldId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldCard({
  field,
  bindings,
  bindModeFieldId,
}: {
  field: DynamicField;
  bindings: readonly FieldBinding[];
  bindModeFieldId: string | null;
}): JSX.Element {
  const ownBindings = bindings
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => b.fieldId === field.id);
  const bindActive = bindModeFieldId === field.id;
  return (
    <div style={styles.fieldCard}>
      <div style={styles.cardHeader}>
        <span style={styles.cardId}>{field.id}</span>
        <span style={styles.cardType}>{field.type}</span>
      </div>
      <TextField
        label="label"
        value={field.label}
        onCommit={(label) =>
          designerStore.updateField(field.id, { label } as Partial<DynamicField>)
        }
      />
      <div style={styles.cardActions}>
        <button
          style={
            bindActive ? { ...styles.smallButton, ...styles.smallButtonActive } : styles.smallButton
          }
          onClick={() => designerStore.setBindMode(bindActive ? null : field.id)}
        >
          {bindActive ? 'Click a canvas element…' : 'Bind from canvas'}
        </button>
        <button style={styles.smallButton} onClick={() => designerStore.removeField(field.id)}>
          remove
        </button>
      </div>
      <BindingList bindings={ownBindings} />
    </div>
  );
}

function BindingList({
  bindings,
}: {
  bindings: readonly { b: FieldBinding; idx: number }[];
}): JSX.Element {
  if (bindings.length === 0) {
    return <p style={styles.bindEmpty}>no bindings yet</p>;
  }
  return (
    <div style={styles.bindList}>
      {bindings.map(({ b, idx }) => (
        <div key={idx} style={styles.bindRow}>
          <span>→ {describeBinding(b)}</span>
          <button style={styles.smallButton} onClick={() => designerStore.removeBindingAt(idx)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
