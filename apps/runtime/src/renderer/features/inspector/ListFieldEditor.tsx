import { useState } from 'react';
import type { FieldValue, ListItem } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { addItem, itemText, moveItem, removeItem, setItemText, toListItems } from './listField.js';

/**
 * B-040 — the operator Inspector's editor for a `list` (array) dynamic field, e.g.
 * a ticker's Data key. Edits each item's `text` (preserving its stable `id` + any
 * other fields) and supports add / remove / reorder, committing the STRUCTURED
 * `ListItem[]` array — never a `String()`-coerced `"[object Object]"`. Matches the
 * Inspector's raw-element + inline-style conventions (the Runtime has no shared UI
 * primitives; see the change design for why this is Runtime-local, not extracted).
 *
 * Local state is seeded from `value` on mount; the parent re-mounts this editor
 * (via a value-signature `key`) when the selection or the upstream value changes,
 * mirroring the scalar inputs' `key={fieldId-value}` resync. Text edits commit on
 * blur; structural ops (add/remove/reorder) commit immediately.
 */
const styles = {
  list: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  empty: { color: colors.textMuted, fontSize: '0.8rem', margin: 0 },
  row: { display: 'flex', gap: '0.25rem', alignItems: 'center' },
  input: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.2rem',
    fontSize: '0.9rem',
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box' as const,
  },
  btn: {
    background: colors.panel,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '0.2rem 0.4rem',
    lineHeight: 1,
  },
  addBtn: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    padding: '0.3rem 0.5rem',
    alignSelf: 'flex-start' as const,
  },
} as const;

export function ListFieldEditor({
  fieldId,
  value,
  onCommit,
}: {
  fieldId: string;
  value: FieldValue | undefined;
  /** Commit the structured array. A `ListItem[]` is a valid `FieldValue`. */
  onCommit: (next: ListItem[]) => void;
}): JSX.Element {
  const [items, setItems] = useState<ListItem[]>(() => toListItems(value));

  /** Structural ops (add/remove/reorder): update local + ship immediately. */
  const commitNow = (next: ListItem[]): void => {
    setItems(next);
    onCommit(next);
  };

  return (
    <div style={styles.list} aria-label={`${fieldId} items`}>
      {items.length === 0 && <p style={styles.empty}>No items.</p>}
      {items.map((item, i) => (
        <div key={item.id} style={styles.row}>
          <input
            style={styles.input}
            type="text"
            value={itemText(item)}
            aria-label={`${fieldId} item ${String(i + 1)}`}
            onChange={(e) => setItems((cur) => setItemText(cur, i, e.target.value))}
            onBlur={() => onCommit(items)}
          />
          <button
            type="button"
            style={styles.btn}
            aria-label={`Move ${fieldId} item ${String(i + 1)} up`}
            disabled={i === 0}
            onClick={() => commitNow(moveItem(items, i, i - 1))}
          >
            ↑
          </button>
          <button
            type="button"
            style={styles.btn}
            aria-label={`Move ${fieldId} item ${String(i + 1)} down`}
            disabled={i === items.length - 1}
            onClick={() => commitNow(moveItem(items, i, i + 1))}
          >
            ↓
          </button>
          <button
            type="button"
            style={styles.btn}
            aria-label={`Remove ${fieldId} item ${String(i + 1)}`}
            onClick={() => commitNow(removeItem(items, i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        style={styles.addBtn}
        aria-label={`Add ${fieldId} item`}
        onClick={() => commitNow(addItem(items, `item-${uuid()}`))}
      >
        Add item
      </button>
    </div>
  );
}
