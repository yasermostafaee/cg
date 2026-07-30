import { useRef, useState } from 'react';
import type { FieldValue, ListItem } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { AutoGrowTextarea } from '../../ui/AutoGrowTextarea.js';
import { Button } from '../../ui/Button.js';
import {
  addItem,
  dropTargetIndex,
  itemText,
  moveItem,
  removeItem,
  setItemText,
  toListItems,
  type DropEdge,
} from './listField.js';

/**
 * R-003 — the operator Inspector's editor for a `list` (array) dynamic field.
 * Edits STAGE: every item op (text, add, remove, reorder) is written back
 * through `onStage` as the whole structured `ListItem[]`, which the draft store
 * holds until the operator applies the item. There is NO local `useState` for the
 * VALUE and NO remount key — the editor renders the draft-or-applied value the
 * parent passes, so an incoming push updates un-staged siblings live while this
 * field keeps its draft, and the first click on ↑/↓/×/Add always lands (the
 * recorded R-003 hazard, removed).
 *
 * Item text is an auto-growing `<textarea>` so multi-line item text (newlines)
 * survives display AND apply (B-040); Enter inserts a newline — it never
 * commits or submits.
 *
 * THE LAYOUT, and why it changed. The reorder and delete buttons used to sit on the
 * SAME LINE as the textarea and took their width from it: inside a 320px Inspector
 * that left the text about 80px, in which Persian broke mid-word across three lines.
 * The controls now have their own line beneath the text, so the textarea gets the
 * field's full width at every panel width — including dragged-narrow and the
 * narrow-screen overlay, which the container query in `controls.css` covers.
 *
 * DRAG REORDER IS AN ADDITION, NOT A REPLACEMENT. The ↑/↓ buttons stay, because
 * drag is unreachable by keyboard and awkward under time pressure; drag is the
 * faster path for a pointer, and the buttons remain the complete one.
 */
const styles = {
  list: { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', minWidth: 0 },
  empty: { color: colors.textMuted, fontSize: '0.8rem', margin: 0 },
  addWrap: { alignSelf: 'flex-start' as const },
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
  // Drag state is PURELY presentational (which row is lifted, where it would land).
  // The value still changes only through `onStage`, on drop.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ index: number; edge: DropEdge } | null>(null);
  // The row elements, so the handle can arm the row it belongs to. A ref rather
  // than state: `draggable` has to be true on the element BEFORE the browser
  // decides a drag is starting, and a state update would not have re-rendered yet.
  const rows = useRef<Map<number, HTMLDivElement>>(new Map());

  const endDrag = (): void => {
    setDragIndex(null);
    setDrop(null);
    // Disarm every row: the panel is back to a normal editor until a handle is
    // pressed again. Leaving a row draggable is what would let a text selection
    // inside the textarea start a drag of the whole item.
    for (const el of rows.current.values()) el.draggable = false;
  };

  const commitDrop = (over: number, edge: DropEdge): void => {
    if (dragIndex === null) return;
    const to = dropTargetIndex(dragIndex, over, edge);
    if (to !== dragIndex) onStage(moveItem(items, dragIndex, to));
    endDrag();
  };

  return (
    <div style={styles.list} aria-label={`${fieldId} items`}>
      {items.length === 0 && <p style={styles.empty}>No items.</p>}
      {items.map((item, i) => {
        const n = String(i + 1);
        const isDropTarget = drop !== null && drop.index === i && dragIndex !== i;
        const className = [
          'cg-list-item',
          dragIndex === i ? 'is-dragging' : '',
          isDropTarget && drop.edge === 'before' ? 'is-drop-before' : '',
          isDropTarget && drop.edge === 'after' ? 'is-drop-after' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={item.id}
            className={className}
            ref={(el) => {
              if (el === null) rows.current.delete(i);
              else rows.current.set(i, el);
            }}
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
              // Firefox ignores a drag with no payload; the index travels in our
              // own state, so the data is only there to make the drag valid.
              e.dataTransfer.setData('text/plain', n);
            }}
            onDragEnd={endDrag}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault(); // required, or the drop event never fires
              e.dataTransfer.dropEffect = 'move';
              const box = e.currentTarget.getBoundingClientRect();
              const edge: DropEdge = e.clientY < box.top + box.height / 2 ? 'before' : 'after';
              setDrop((prev) =>
                prev !== null && prev.index === i && prev.edge === edge ? prev : { index: i, edge },
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              commitDrop(i, e.clientY < box.top + box.height / 2 ? 'before' : 'after');
            }}
          >
            <AutoGrowTextarea
              value={itemText(item)}
              aria-label={`${fieldId} item ${n}`}
              onChange={(e) => onStage(setItemText(items, i, e.target.value))}
            />
            <div className="cg-list-item__tools">
              {/*
                The handle ARMS its row for dragging on pointer-down and is otherwise
                inert. `aria-hidden` + `tabIndex={-1}` are deliberate: it cannot be
                operated by keyboard, and announcing a control a screen-reader user
                cannot use would be worse than silence — the ↑/↓ buttons beside it are
                the labelled, complete, keyboard-reachable path to the same result.
              */}
              <span
                className="cg-list-handle"
                aria-hidden="true"
                tabIndex={-1}
                title="Drag to reorder (or use the arrows)"
                onPointerDown={() => {
                  const el = rows.current.get(i);
                  if (el !== undefined) el.draggable = true;
                }}
                onPointerUp={() => {
                  const el = rows.current.get(i);
                  if (el !== undefined) el.draggable = false;
                }}
              >
                ⠿
              </span>
              <span className="cg-list-item__index" aria-hidden="true">
                {n}
              </span>
              <Button
                variant="verb"
                aria-label={`Move ${fieldId} item ${n} up`}
                disabled={i === 0}
                onClick={() => onStage(moveItem(items, i, i - 1))}
              >
                ↑
              </Button>
              <Button
                variant="verb"
                aria-label={`Move ${fieldId} item ${n} down`}
                disabled={i === items.length - 1}
                onClick={() => onStage(moveItem(items, i, i + 1))}
              >
                ↓
              </Button>
              <span className="cg-list-item__spacer" />
              <Button
                variant="verb"
                aria-label={`Remove ${fieldId} item ${n}`}
                onClick={() => onStage(removeItem(items, i))}
              >
                ×
              </Button>
            </div>
          </div>
        );
      })}
      <div style={styles.addWrap}>
        {/* `neutral`, not the old accented `secondary`: colour belongs to STATE in
            this build, and adding an item is an affordance like any other. */}
        <Button
          variant="neutral"
          aria-label={`Add ${fieldId} item`}
          onClick={() => onStage(addItem(items, `item-${uuid()}`))}
        >
          Add item
        </Button>
      </div>
    </div>
  );
}
