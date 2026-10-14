import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowDownAZ, ChevronLeft, ChevronRight, LayoutGrid, List, X } from 'lucide-react';
import type { FieldDigits, SequenceItem } from '@cg/shared-schema';
import { cx } from '../../cx.js';
import { designerStore } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Select } from '../../ui/Select.js';
import { Textarea } from '../../ui/Textarea.js';
import { shown, typedInto, type CompositionChoice } from '../fields/ListItemsEditor.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { PageAddButtons } from './PageAddButtons.js';
import {
  isPicture,
  itemLabel,
  moveItems,
  removeItems,
  sortPicturesByName,
  stepItem,
} from './pageItems.js';
import { usePageThumb } from './pageThumbs.js';
import * as s from './Pages.css.js';

/** What the manager needs to edit a text or composition item where it stands. */
interface ItemEditing {
  /** Every composition an item may show (its picker), missing references included. */
  compositions: readonly CompositionChoice[];
  /** The sequence's reading direction, for a text item's box. */
  dir: 'ltr' | 'rtl';
  /** The Digits a text item's box is typed in (`TEXT-DIGITS-01`), as the item editor's. */
  textDigits: (itemId: string) => FieldDigits | undefined;
}

/**
 * `D-163` — **THE PAGES MANAGER.** Every item of a book, seen and arranged in one place: a grid of
 * cards numbered in reading order — a picture as its thumbnail with its file name, a text item as a
 * box to type in, a composition item as its picker.
 *
 * - **Add** pictures, a folder, a text item or a composition item (the same row the Inspector shows).
 * - **Drag** a card (or the selected cards) between two others to move it; the bar shows where it
 *   lands. **‹ ›** move one card one step, for the keyboard.
 * - **Click** a thumbnail, or a card's number, to select it; **Shift-click** selects a run;
 *   **Remove selected** takes them out, **×** takes out one.
 * - **Sort by name** puts the pictures in natural file-name order (`page2` before `page10`).
 * - **List** shows the same items in the item editor, for dwell and data keys.
 *
 * Every change is ONE store edit as it is made (so one undo step each, and the canvas follows);
 * **Done** only closes.
 */
export function PagesModal({
  elementId,
  title,
  items,
  listView,
  editing,
  firstComposition,
  onClose,
}: {
  elementId: string;
  title: string;
  items: readonly SequenceItem[];
  /** The sequence's own item editor, for the List view. */
  listView: ReactNode;
  editing: ItemEditing;
  /** The composition a new composition item shows first; absent ⇒ there is none to add. */
  firstComposition: string | undefined;
  onClose: () => void;
}): JSX.Element {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragIds, setDragIds] = useState<ReadonlySet<string> | null>(null);
  const [over, setOver] = useState<{ index: number; side: 'before' | 'after' } | null>(null);

  // The selection only ever names items that still exist.
  const chosen = useMemo(() => {
    const live = new Set(items.map((i) => i.id));
    return new Set([...picked].filter((id) => live.has(id)));
  }, [picked, items]);
  const allPictures = items.length > 0 && items.every(isPicture);
  const pictureCount = items.filter(isPicture).length;
  const commit = (next: SequenceItem[]): void => designerStore.setSequenceItems(elementId, next);
  const change = (id: string, patch: Partial<Record<'text' | 'compositionId', string>>): void =>
    commit(items.map((it) => (it.id === id ? ({ ...it, ...patch } as SequenceItem) : it)));

  function toggle(id: string, index: number, range: boolean): void {
    const from = anchor === null ? -1 : items.findIndex((i) => i.id === anchor);
    if (range && from >= 0) {
      const [lo, hi] = from < index ? [from, index] : [index, from];
      setPicked(new Set([...chosen, ...items.slice(lo, hi + 1).map((i) => i.id)]));
      return;
    }
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setAnchor(id);
  }

  function endDrag(): void {
    setDragIds(null);
    setOver(null);
  }

  function dragOver(e: DragEvent<HTMLLIElement>, index: number): void {
    if (dragIds === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < box.left + box.width / 2 ? 'before' : 'after';
    if (over?.index !== index || over.side !== side) setOver({ index, side });
  }

  function drop(e: DragEvent<HTMLLIElement>): void {
    e.preventDefault();
    if (dragIds !== null && over !== null) {
      commit(moveItems(items, dragIds, over.side === 'before' ? over.index : over.index + 1));
    }
    endDrag();
  }

  const countText = allPictures
    ? `${String(items.length)} ${items.length === 1 ? 'page' : 'pages'}`
    : `${String(items.length)} ${items.length === 1 ? 'item' : 'items'}`;

  return (
    <Modal
      title={`Pages — ${title}`}
      onClose={onClose}
      width="min(1080px, 94vw)"
      minBodyHeight="60vh"
      footer={
        <ModalButton
          variant="primary"
          onClick={onClose}
          title="Close — every change is already made"
        >
          Done
        </ModalButton>
      }
    >
      <div className={s.toolbar}>
        <span className={s.count} data-testid="pages-manager-count">
          {countText}
        </span>
        {chosen.size > 0 ? (
          <>
            <span className={s.chosen}>{`${String(chosen.size)} selected`}</span>
            <Button
              variant="danger"
              size="sm"
              title="Remove the selected items from the sequence"
              onClick={() => {
                commit(removeItems(items, chosen));
                setPicked(new Set());
              }}
            >
              Remove selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Select nothing"
              onClick={() => setPicked(new Set())}
            >
              Clear selection
            </Button>
          </>
        ) : (
          items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              title="Select every item"
              onClick={() => setPicked(new Set(items.map((i) => i.id)))}
            >
              Select all
            </Button>
          )
        )}
        <span className={s.spacer} />
        <Button
          variant="secondary"
          size="sm"
          disabled={pictureCount < 2}
          title="Put the pictures in file-name order (page2 before page10); other items keep their place"
          onClick={() => commit(sortPicturesByName(items))}
        >
          <Icon icon={ArrowDownAZ} size={14} />
          Sort by name
        </Button>
        <div className={s.viewGroup} role="group" aria-label="View">
          <Control
            aria-label="Grid view"
            title="Grid view — every item as a card"
            aria-pressed={view === 'grid'}
            selected={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <Icon icon={LayoutGrid} size={15} />
          </Control>
          <Control
            aria-label="List view"
            title="List view — the item editor, with dwell and data keys"
            aria-pressed={view === 'list'}
            selected={view === 'list'}
            onClick={() => setView('list')}
          >
            <Icon icon={List} size={15} />
          </Control>
        </div>
      </div>
      <div className={s.addBar}>
        <PageAddButtons
          elementId={elementId}
          items={items}
          firstComposition={firstComposition}
          size="sm"
          picturesOnly={view === 'list'}
        />
      </div>

      {view === 'list' ? (
        <div className={s.listView}>{listView}</div>
      ) : items.length === 0 ? (
        <p className={s.empty}>No items yet.</p>
      ) : (
        <ol className={s.grid} aria-label="Pages">
          {items.map((item, index) => (
            <PageCard
              key={item.id}
              item={item}
              number={index + 1}
              last={index === items.length - 1}
              selected={chosen.has(item.id)}
              dragging={dragIds?.has(item.id) === true}
              mark={over?.index === index ? over.side : null}
              editing={editing}
              onText={(text) => change(item.id, { text })}
              onComposition={(compositionId) => change(item.id, { compositionId })}
              onToggle={(range) => toggle(item.id, index, range)}
              onStep={(by) => commit(stepItem(items, item.id, by))}
              onRemove={() => commit(removeItems(items, new Set([item.id])))}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-cg-page', item.id);
                setDragIds(chosen.has(item.id) ? chosen : new Set([item.id]));
              }}
              onDragOver={(e) => dragOver(e, index)}
              onDrop={drop}
              onDragEnd={endDrag}
            />
          ))}
        </ol>
      )}
    </Modal>
  );
}

function PageCard({
  item,
  number,
  last,
  selected,
  dragging,
  mark,
  editing,
  onText,
  onComposition,
  onToggle,
  onStep,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: SequenceItem;
  number: number;
  last: boolean;
  selected: boolean;
  dragging: boolean;
  mark: 'before' | 'after' | null;
  editing: ItemEditing;
  onText: (text: string) => void;
  onComposition: (compositionId: string) => void;
  onToggle: (range: boolean) => void;
  onStep: (by: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: (e: DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: DragEvent<HTMLLIElement>) => void;
  onDrop: (e: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}): JSX.Element {
  const picture = isPicture(item);
  const thumb = usePageThumb(picture ? item.assetId : undefined);
  const composition = !picture && 'compositionId' in item ? item.compositionId : undefined;
  const name = picture
    ? itemLabel(item)
    : composition !== undefined
      ? (editing.compositions.find((c) => c.id === composition)?.name ?? 'Composition')
      : 'Text';
  // The number is the select toggle on every card; on a picture the whole thumbnail is too.
  const badge = (
    <Control
      variant="bare"
      className={cx(s.badge, s.badgeButton, selected && s.badgeSelected)}
      aria-label={`Select item ${String(number)}`}
      aria-pressed={selected}
      title={
        selected
          ? 'Selected — click to deselect (Shift-click selects a run)'
          : 'Select (Shift-click selects a run)'
      }
      onClick={(e) => onToggle(e.shiftKey)}
    >
      {number}
    </Control>
  );
  return (
    <li
      className={cx(
        s.card,
        selected && s.cardSelected,
        dragging && s.cardDragging,
        mark === 'before' && s.dropBefore,
        mark === 'after' && s.dropAfter,
      )}
      data-page-card=""
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {picture ? (
        <div className={s.thumbBox}>
          <Control
            variant="bare"
            className={s.thumbButton}
            aria-label={`Page ${String(number)}: ${name}`}
            aria-pressed={selected}
            title={`${name} — click to select (Shift-click selects a run); drag to move`}
            onClick={(e) => onToggle(e.shiftKey)}
          >
            {thumb !== null && <img src={thumb} alt="" className={s.thumbImg} draggable={false} />}
          </Control>
          {badge}
        </div>
      ) : composition !== undefined ? (
        <div className={cx(s.thumbBox, s.itemBox)}>
          <Select
            value={composition}
            aria-label={`Item ${String(number)} composition`}
            title="The composition this item shows"
            onChange={(e) => onComposition(e.target.value)}
          >
            {editing.compositions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </Select>
          {badge}
        </div>
      ) : (
        <div className={cx(s.thumbBox, s.itemBox)}>
          <Textarea
            className={s.cardText}
            value={shown(itemLabel(item), editing.textDigits(item.id))}
            dir={editing.dir}
            placeholder="Text"
            aria-label={`Item ${String(number)} text`}
            title="The text this item shows"
            onChange={(e) =>
              onText(typedInto(e.currentTarget, e.nativeEvent, editing.textDigits(item.id)))
            }
          />
          {badge}
        </div>
      )}
      <div className={s.cardFoot}>
        <span className={s.cardName} title={name} data-page-name="">
          {name}
        </span>
        <Control
          size="sm"
          aria-label={`Move item ${String(number)} earlier`}
          title="Move earlier"
          disabled={number === 1}
          onClick={() => onStep(-1)}
        >
          <Icon icon={ChevronLeft} size={14} />
        </Control>
        <Control
          size="sm"
          aria-label={`Move item ${String(number)} later`}
          title="Move later"
          disabled={last}
          onClick={() => onStep(1)}
        >
          <Icon icon={ChevronRight} size={14} />
        </Control>
        <Control
          size="sm"
          aria-label={`Remove item ${String(number)}`}
          title="Remove from the sequence"
          onClick={onRemove}
        >
          <Icon icon={X} size={14} />
        </Control>
      </div>
    </li>
  );
}
