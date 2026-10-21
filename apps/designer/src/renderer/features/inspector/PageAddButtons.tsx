import type { SequenceItem } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { Button, type ButtonSize } from '../../ui/Button.js';
import { newItemId } from '../fields/ListItemsEditor.js';
import { useAddPictures } from './useAddPictures.js';
import * as s from './Pages.css.js';

/**
 * `D-163` — **EVERY WAY TO ADD TO A SEQUENCE, IN ONE ROW**: pictures, a folder, a text item, a
 * composition item. The Inspector's card and the Pages manager both show this row, so neither is
 * the one place a kind of item can be added (the owner's report: the grid and the Inspector could
 * add only pictures). A text or composition item is made exactly as the item editor's `Add item`
 * makes one (`newItemId`), appended as ONE edit.
 *
 * 🔴 `RUN-NEXT-VERSION-03` 1.7 — **EACH CLICK SHOWS ITS RESULT, AND IS ONE UNDO STEP.** The owner
 * pressed `Add text` and saw nothing: an empty item at the end of a list nothing was looking at. The
 * new item is now the one the author is working on (`focusSequenceItem` — the canvas shows it, the
 * card's strip marks it), and each click is its own history entry: two clicks inside the history's
 * coalescing window used to undo as one.
 */
export function PageAddButtons({
  elementId,
  items,
  firstComposition,
  size = 'md',
  picturesOnly = false,
  onAdded,
}: {
  elementId: string;
  items: readonly SequenceItem[];
  /** The composition a new composition item shows first; absent ⇒ there is none to add. */
  firstComposition: string | undefined;
  size?: ButtonSize;
  /**
   * Beside the item editor, whose own `Add item` and kind picker already add text and composition
   * items: only the two picture buttons, so no surface offers the same act twice.
   */
  picturesOnly?: boolean;
  /** A text or composition item was added (the Inspector card puts the focus in its text box). */
  onAdded?: (item: SequenceItem) => void;
}): JSX.Element {
  const { busy, add } = useAddPictures(elementId);
  const append = (item: SequenceItem): void => {
    designerStore.runAsSingleHistoryEntry(() =>
      designerStore.setSequenceItems(elementId, [...items, item]),
    );
    designerStore.focusSequenceItem({ elementId, itemId: item.id });
    onAdded?.(item);
  };
  return (
    <div className={s.addButtons}>
      <Button
        variant="secondary"
        size={size}
        disabled={busy !== null}
        title="Add picture files as pages, in file-name order (page2 before page10)"
        onClick={() => void add(false)}
      >
        {busy === null ? 'Add pictures…' : `Adding ${String(busy.done)} / ${String(busy.total)}…`}
      </Button>
      <Button
        variant="secondary"
        size={size}
        disabled={busy !== null}
        title="Add every picture in a folder as pages, in file-name order"
        onClick={() => void add(true)}
      >
        Add folder…
      </Button>
      {!picturesOnly && (
        <>
          <Button
            variant="secondary"
            size={size}
            title="Add a text item at the end"
            onClick={() => append({ id: newItemId(), text: '' })}
          >
            Add text
          </Button>
          <Button
            variant="secondary"
            size={size}
            disabled={firstComposition === undefined}
            title={
              firstComposition === undefined
                ? 'This project has no other composition to add'
                : 'Add a composition item at the end'
            }
            onClick={() => {
              if (firstComposition === undefined) return;
              append({ id: newItemId(), kind: 'composition', compositionId: firstComposition });
            }}
          >
            Add composition
          </Button>
        </>
      )}
    </div>
  );
}
