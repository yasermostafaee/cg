import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowDownAZ, ChevronLeft, ChevronRight, LayoutGrid, List, X } from 'lucide-react';
import type { SequenceItem } from '@cg/shared-schema';
import { cx } from '../../cx.js';
import { designerStore } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import {
  isPicture,
  itemLabel,
  moveItems,
  removeItems,
  sortPicturesByName,
  stepItem,
} from './pageItems.js';
import { usePageThumb } from './pageThumbs.js';
import { useAddPictures } from './useAddPictures.js';
import * as s from './Pages.css.js';

/**
 * `D-163` — **THE PAGES MANAGER.** Every page of a book, seen as a picture and arranged in one
 * place: a grid of thumbnails, numbered in reading order, with the file name under each.
 *
 * - **Drag** a page (or the selected pages) between two others to move it; the bar shows where it
 *   lands. **‹ ›** move one page one step, for the keyboard.
 * - **Click** a thumbnail to select it, **Shift-click** to select a run; **Remove selected** takes
 *   them out, **×** takes out one.
 * - **Sort by name** puts the pictures in natural file-name order (`page2` before `page10`).
 * - **Add pictures… / Add folder…** append, exactly as in the Inspector.
 * - **List** shows the same items in the item editor, for dwell, data keys and text items.
 *
 * Every change is ONE store edit as it is made (so one undo step each, and the canvas follows);
 * **Done** only closes.
 */
export function PagesModal({
  elementId,
  title,
  items,
  listView,
  onClose,
}: {
  elementId: string;
  title: string;
  items: readonly SequenceItem[];
  /** The sequence's own item editor, for the List view. */
  listView: ReactNode;
  onClose: () => void;
}): JSX.Element {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragIds, setDragIds] = useState<ReadonlySet<string> | null>(null);
  const [over, setOver] = useState<{ index: number; side: 'before' | 'after' } | null>(null);
  const { busy, add } = useAddPictures(elementId);

  // The selection only ever names items that still exist.
  const chosen = useMemo(() => {
    const live = new Set(items.map((i) => i.id));
    return new Set([...picked].filter((id) => live.has(id)));
  }, [picked, items]);
  const allPictures = items.length > 0 && items.every(isPicture);
  const pictureCount = items.filter(isPicture).length;
  const commit = (next: SequenceItem[]): void => designerStore.setSequenceItems(elementId, next);

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
        <ModalButton variant="primary" onClick={onClose}>
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
              onClick={() => {
                commit(removeItems(items, chosen));
                setPicked(new Set());
              }}
            >
              Remove selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
              Clear selection
            </Button>
          </>
        ) : (
          items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
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
          onClick={() => commit(sortPicturesByName(items))}
        >
          <Icon icon={ArrowDownAZ} size={14} />
          Sort by name
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => void add(false)}
        >
          {busy === null ? 'Add pictures…' : `Adding ${String(busy.done)} / ${String(busy.total)}…`}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => void add(true)}
        >
          Add folder…
        </Button>
        <div className={s.viewGroup} role="group" aria-label="View">
          <Control
            aria-label="Grid view"
            title="Grid view"
            aria-pressed={view === 'grid'}
            selected={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <Icon icon={LayoutGrid} size={15} />
          </Control>
          <Control
            aria-label="List view"
            title="List view"
            aria-pressed={view === 'list'}
            selected={view === 'list'}
            onClick={() => setView('list')}
          >
            <Icon icon={List} size={15} />
          </Control>
        </div>
      </div>

      {view === 'list' ? (
        <div className={s.listView}>{listView}</div>
      ) : items.length === 0 ? (
        <p className={s.empty}>No pages yet.</p>
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
  onToggle: (range: boolean) => void;
  onStep: (by: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: (e: DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: DragEvent<HTMLLIElement>) => void;
  onDrop: (e: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}): JSX.Element {
  const label = itemLabel(item);
  const thumb = usePageThumb(isPicture(item) ? item.assetId : undefined);
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
      <Control
        variant="bare"
        className={s.thumbButton}
        aria-label={`Page ${String(number)}: ${label}`}
        aria-pressed={selected}
        onClick={(e) => onToggle(e.shiftKey)}
      >
        {isPicture(item) ? (
          thumb !== null && <img src={thumb} alt="" className={s.thumbImg} draggable={false} />
        ) : (
          <span className={s.thumbText}>{label}</span>
        )}
        <span className={cx(s.badge, selected && s.badgeSelected)}>{number}</span>
      </Control>
      <div className={s.cardFoot}>
        <span className={s.cardName} title={label} data-page-name="">
          {label}
        </span>
        <Control
          size="sm"
          aria-label={`Move page ${String(number)} earlier`}
          title="Move earlier"
          disabled={number === 1}
          onClick={() => onStep(-1)}
        >
          <Icon icon={ChevronLeft} size={14} />
        </Control>
        <Control
          size="sm"
          aria-label={`Move page ${String(number)} later`}
          title="Move later"
          disabled={last}
          onClick={() => onStep(1)}
        >
          <Icon icon={ChevronRight} size={14} />
        </Control>
        <Control
          size="sm"
          aria-label={`Remove page ${String(number)}`}
          title="Remove"
          onClick={onRemove}
        >
          <Icon icon={X} size={14} />
        </Control>
      </div>
    </li>
  );
}
