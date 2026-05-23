import type { StackItemState } from '@cg/shared-schema';
import { airStateVisual, colors } from '../../theme.js';

interface Props {
  item: StackItemState;
  selected: boolean;
  onSelect: (itemId: string) => void;
  onTake: (itemId: string) => void;
  onUpdate: (itemId: string) => void;
  onOut: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr auto',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    cursor: 'pointer',
  },
  rowSelected: {
    background: colors.panelMuted,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  statusIcon: { fontSize: '1.2rem' },
  body: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem' },
  title: { fontSize: '1rem', fontWeight: 600 },
  subtitle: { fontSize: '0.8rem', color: colors.textMuted },
  actions: { display: 'flex', gap: '0.5rem' },
  button: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.35rem 0.75rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  buttonDanger: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  },
} as const;

/**
 * One operator-facing stack item. Per Phase 6 §3:
 *  - Status pill (color + icon + word — never hue alone).
 *  - Body shows title + slot.
 *  - Action buttons: TAKE, UPDATE, OUT, REMOVE (Phase 6 §3.2 keymap
 *    arrives with M5.4 alongside the lock screen).
 */
export function StackRow({
  item,
  selected,
  onSelect,
  onTake,
  onUpdate,
  onOut,
  onRemove,
}: Props): JSX.Element {
  const visual = airStateVisual(item.status, item.pending);
  const title = String(item.fields['title'] ?? item.itemId);
  const slot = item.slot ? `slot ${item.slot.channel}-${item.slot.layer}` : 'no slot';

  return (
    <div
      style={selected ? { ...styles.row, ...styles.rowSelected } : styles.row}
      onClick={() => onSelect(item.itemId)}
    >
      <div style={{ ...styles.status, color: visual.color }}>
        <span style={styles.statusIcon}>{visual.icon}</span>
        {visual.label}
      </div>
      <div style={styles.body}>
        <div style={styles.title}>{title}</div>
        <div style={styles.subtitle}>
          {item.templateId} • {slot}
        </div>
      </div>
      <div style={styles.actions}>
        <button
          style={styles.button}
          onClick={(e) => {
            e.stopPropagation();
            onTake(item.itemId);
          }}
          disabled={item.status === 'on-air' || item.status === 'playing'}
        >
          TAKE
        </button>
        <button
          style={styles.button}
          onClick={(e) => {
            e.stopPropagation();
            onUpdate(item.itemId);
          }}
          disabled={item.status !== 'on-air' && item.status !== 'playing'}
        >
          UPDATE
        </button>
        <button
          style={styles.button}
          onClick={(e) => {
            e.stopPropagation();
            onOut(item.itemId);
          }}
          disabled={item.status === 'idle' || item.status === 'loaded'}
        >
          OUT
        </button>
        <button
          style={styles.buttonDanger}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.itemId);
          }}
        >
          REMOVE
        </button>
      </div>
    </div>
  );
}
