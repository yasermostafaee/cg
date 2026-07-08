import type { FieldValue, ListItem } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { addItem, itemText, moveItem, removeItem, setItemText, toListItems } from './listField.js';

/**
 * R-003 — the operator Inspector's editor for a `list` (array) dynamic field.
 * Edits STAGE: every item op (text, add, remove, reorder) is written back
 * through `onStage` as the whole structured `ListItem[]`, which the draft store
 * holds until the operator applies the item. There is NO local `useState` and
 * NO remount key — the editor renders the draft-or-applied value the parent
 * passes, so an incoming push updates un-staged siblings live while this field
 * keeps its draft, and the first click on ↑/↓/×/Add always lands (the recorded
 * R-003 hazard, removed).
 *
 * Item text is an auto-growing `<textarea>` so multi-line item text (newlines)
 * survives display AND apply (B-040); Enter inserts a newline — it never
 * commits or submits.
 */
const styles = {
  list: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  empty: { color: colors.textMuted, fontSize: '0.8rem', margin: 0 },
  row: { display: 'flex', gap: '0.25rem', alignItems: 'flex-start' },
  input: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.25rem 0.5rem',
    borderRadius: '0.2rem',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    lineHeight: 1.4,
    resize: 'vertical' as const,
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
  onStage,
}: {
  fieldId: string;
  value: FieldValue | undefined;
  /** Stage the whole structured array. A `ListItem[]` is a valid `FieldValue`. */
  onStage: (next: ListItem[]) => void;
}): JSX.Element {
  const items = toListItems(value);

  return (
    <div style={styles.list} aria-label={`${fieldId} items`}>
      {items.length === 0 && <p style={styles.empty}>No items.</p>}
      {items.map((item, i) => (
        <div key={item.id} style={styles.row}>
          <textarea
            style={styles.input}
            value={itemText(item)}
            rows={Math.min(Math.max(itemText(item).split('\n').length, 2), 8)}
            aria-label={`${fieldId} item ${String(i + 1)}`}
            onChange={(e) => onStage(setItemText(items, i, e.target.value))}
          />
          <button
            type="button"
            style={styles.btn}
            aria-label={`Move ${fieldId} item ${String(i + 1)} up`}
            disabled={i === 0}
            onClick={() => onStage(moveItem(items, i, i - 1))}
          >
            ↑
          </button>
          <button
            type="button"
            style={styles.btn}
            aria-label={`Move ${fieldId} item ${String(i + 1)} down`}
            disabled={i === items.length - 1}
            onClick={() => onStage(moveItem(items, i, i + 1))}
          >
            ↓
          </button>
          <button
            type="button"
            style={styles.btn}
            aria-label={`Remove ${fieldId} item ${String(i + 1)}`}
            onClick={() => onStage(removeItem(items, i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        style={styles.addBtn}
        aria-label={`Add ${fieldId} item`}
        onClick={() => onStage(addItem(items, `item-${uuid()}`))}
      >
        Add item
      </button>
    </div>
  );
}
