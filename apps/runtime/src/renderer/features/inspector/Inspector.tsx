import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';

interface Props {
  item: StackItemState | null;
}

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.panel,
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    padding: '0.75rem 1rem',
    gap: '0.5rem',
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  heading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  empty: { color: colors.textMuted, fontSize: '0.9rem' },
  title: { fontSize: '1.1rem', fontWeight: 600, margin: 0 },
  meta: { color: colors.textMuted, fontSize: '0.85rem' },
  field: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '0.5rem',
    padding: '0.25rem 0',
    fontSize: '0.9rem',
  },
  fieldLabel: { color: colors.textMuted, fontWeight: 500 },
  fieldValue: { color: colors.text, fontWeight: 500 },
} as const;

/** Inspector pane (Phase 6 §4). Shows fields of the currently-selected stack item. */
export function Inspector({ item }: Props): JSX.Element {
  if (item === null) {
    return (
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.heading}>INSPECTOR</h2>
        <p style={styles.empty}>Select a stack item to inspect its fields.</p>
      </aside>
    );
  }
  const entries = Object.entries(item.fields);
  return (
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.heading}>INSPECTOR</h2>
      <h3 style={styles.title}>{String(item.fields['title'] ?? item.itemId)}</h3>
      <div style={styles.meta}>{item.templateId}</div>
      <div style={styles.meta}>
        Status: {item.status}
        {item.pending ? ' (pending)' : ''}
      </div>
      {item.slot && (
        <div style={styles.meta}>
          Slot: {item.slot.channel}-{item.slot.layer} on {item.slot.server}
        </div>
      )}
      <div
        style={{
          marginTop: '0.5rem',
          borderTop: `1px solid ${colors.border}`,
          paddingTop: '0.5rem',
        }}
      >
        <h2 style={styles.heading}>FIELDS</h2>
        {entries.length === 0 ? (
          <p style={styles.empty}>No fields.</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} style={styles.field}>
              <span style={styles.fieldLabel}>{key}</span>
              <span style={styles.fieldValue}>{String(value)}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
