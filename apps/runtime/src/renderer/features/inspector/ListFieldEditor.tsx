import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react';
import type { FieldValue, ListItem } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { uuid } from '../../lib/uuid.js';
import { AutoGrowTextarea } from '../../ui/AutoGrowTextarea.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
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
 * THE LAYOUT — ONE ITEM IS ONE ROW: a single control cluster, then its text.
 *
 * This supersedes the previous arrangement, whose reasoning is kept because half of
 * it is still load-bearing. The controls once sat BESIDE the textarea and took their
 * width from it: inside a 320px Inspector that left the text about 80px, in which
 * Persian broke mid-word across three lines. The answer then was to give the controls
 * their OWN LINE beneath the text — which fixed the narrow case and created the wide
 * one. That line was full-width with a `flex: 1` spacer in it, so at FULLSCREEN the
 * reorder arrows and the delete button ended up roughly 1800px apart: five controls
 * acting on one item, scattered across a monitor, below the thing they act on.
 *
 * Both failures are the same failure — the controls sizing themselves from the row
 * instead of from THEMSELVES. A fixed-size cluster that neither grows nor shrinks,
 * with the text taking whatever is left, is right at BOTH widths, and the row wraps
 * as a whole when even that will not fit. The width was never the problem.
 *
 * THE DURABLE RULE: the five controls that act on one item stay together as ONE
 * cluster, always. Wrapping onto its own line is fine; SPLITTING is not. See
 * `.cg-list-item` in `controls.css`, which also explains the `order: -1` that keeps
 * the textarea first in the DOM (tab order) while the cluster leads on screen.
 *
 * THE CONTROLS ARE `icon`, NOT `verb` — a correction, and the reason is worth keeping.
 * They were `verb` first, which carries `width: 100%` because a row verb fills a
 * table column the sticky header sized. In this flex row that made three buttons each
 * ask for the full width and come out STRETCHED (the owner's report). `icon` is the
 * same neutral look with a small FIXED square and `flex: 0 0 auto`, so it neither
 * grows nor shrinks: the text reflows around them, the controls never resize. That
 * fixed-size-plus-reflow split is what makes the row responsive rather than fragile.
 *
 * A DISABLED MINI STAYS IN PLACE. `↑` on the first item and `↓` on the last render
 * inert rather than absent: a control that vanishes changes the cluster's width, so
 * the first, middle and last rows would each align differently — reflow between rows
 * being its own kind of mess. `--icon:disabled` keeps a visible boundary for the same
 * reason (see `controls.css`).
 *
 * DRAG REORDER IS AN ADDITION, NOT A REPLACEMENT. The ↑/↓ buttons stay, because
 * drag is unreachable by keyboard and awkward under time pressure; drag is the
 * faster path for a pointer, and the buttons remain the complete one.
 */
/* Spacing from the scale (`--r-space-*`): item→item is one step up from the gaps
   INSIDE an item's cluster, which is what makes each row read as one object. */
const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--r-space-2)',
    minWidth: 0,
  },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: 0 },
  /*
   * THE FIELD'S FOOTER — "Add item" and "From file…" on ONE row, per the mock.
   *
   * They are the field's two SOURCES of content (type one, or point at a file), so
   * they belong side by side; stacked, the from-file affordance read as a separate
   * thing that had drifted below the list. `flex-wrap` because that control grows a
   * whole block once a file is attached (name, Reload, detach, split options) and
   * must be allowed to take its own line then.
   */
  addWrap: {
    display: 'flex',
    alignItems: 'flex-start' as const,
    gap: 'var(--r-space-2)',
    flexWrap: 'wrap' as const,
    marginTop: 'var(--r-space-1)',
  },
} as const;

export function ListFieldEditor({
  fieldId,
  value,
  onStage,
  footer,
}: {
  fieldId: string;
  value: FieldValue | undefined;
  /** Stage the whole structured array. A `ListItem[]` is a valid `FieldValue`. */
  onStage: (next: ListItem[]) => void;
  /**
   * Rendered BESIDE "Add item", on the field's one footer row — the from-file
   * affordance. It arrives as a slot rather than being imported here because the
   * two are separate concerns (this editor knows nothing about file sources); the
   * slot exists only so they can share a ROW, which is a layout fact and belongs
   * to whoever owns the row.
   */
  footer?: ReactNode;
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
            {/* FIRST IN THE DOM, SECOND ON SCREEN — see the header and
                `.cg-list-item__tools`'s `order: -1`. Tab order reaches an item's
                text before its controls; the picture puts the cluster first. */}
            <AutoGrowTextarea
              className="cg-list-item__text"
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
                <Icon icon={GripVertical} />
              </span>
              {/* THE ITEM'S IDENTITY is this number, and it is the whole reason no
                  bracketed key is printed per row: the FIELD is named once in its
                  header, the ITEMS are numbered. `ROTATOR[0]` on every row named
                  the field three times and the item never. */}
              <span className="cg-list-item__index" aria-hidden="true">
                {n}
              </span>
              <Button
                variant="icon"
                aria-label={`Move ${fieldId} item ${n} up`}
                disabled={i === 0}
                onClick={() => onStage(moveItem(items, i, i - 1))}
              >
                <Icon icon={ChevronUp} />
              </Button>
              <Button
                variant="icon"
                aria-label={`Move ${fieldId} item ${n} down`}
                disabled={i === items.length - 1}
                onClick={() => onStage(moveItem(items, i, i + 1))}
              >
                <Icon icon={ChevronDown} />
              </Button>
              {/* NEUTRAL AT REST, RED ON HOVER. The strip of glyphs still has to say
                  "this one is different in kind", but it says it under the pointer
                  now rather than by standing at the opposite end of the panel. */}
              <Button
                variant="icon"
                className="cg-list-remove"
                aria-label={`Remove ${fieldId} item ${n}`}
                onClick={() => onStage(removeItem(items, i))}
              >
                <Icon icon={X} />
              </Button>
            </div>
          </div>
        );
      })}
      <div style={styles.addWrap}>
        {/* ONE OF THE THREE ACCENTED ACTIONS (owner request), with Apply position
            and Update. This supersedes the `neutral` it briefly was: adding an item
            is what an operator opens a list field to do, and in the Inspector colour
            marks HIERARCHY. It does not spread to the layer table, where colour
            means STATE — the full rule is at `.cg-btn--accent` in `controls.css`. */}
        <Button
          variant="accent"
          aria-label={`Add ${fieldId} item`}
          onClick={() => onStage(addItem(items, `item-${uuid()}`))}
        >
          {/* lucide, not the mock's `＋` glyph — the design system routes every icon
              through `Icon` so it inherits `currentColor` and one size. */}
          <Icon icon={Plus} />
          Add item
        </Button>
        {footer}
      </div>
    </div>
  );
}
