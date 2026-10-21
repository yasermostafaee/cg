import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutTemplate, Type } from 'lucide-react';
import type { FieldDigits, SequenceItem } from '@cg/shared-schema';
import { cx } from '../../cx.js';
import { shownItemIndex } from '../../state/slices/view.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Textarea } from '../../ui/Textarea.js';
import { shown, typedInto, type CompositionChoice } from '../fields/ListItemsEditor.js';
import { StateLine } from './InfoTip.js';
import { PageAddButtons } from './PageAddButtons.js';
import { isPicture, itemCountText, itemLabel, itemWord, stripWindow } from './pageItems.js';
import { PagesModal } from './PagesModal.js';
import { usePageThumb } from './pageThumbs.js';
import * as s from './Pages.css.js';

/** How many pages the Inspector's card shows before `+N`. */
const STRIP = 4;

/**
 * `D-163` — **A BOOK'S PAGES IN THE INSPECTOR: a card, not a list.** The count, a few pages as
 * thumbnails, and `Manage pages…`, which opens the Pages manager where every item is seen and
 * arranged. The add row — pictures, a folder, a text item, a composition item — is the manager's
 * own. A 300-page book costs the Inspector these few lines, exactly as a 3-page one does (the
 * owner's report: a row per page filled the panel).
 *
 * 🔴 `RUN-NEXT-VERSION-03` 1.7 — **THE ITEM BEING WORKED ON.** `Add text` used to change nothing
 * here: the count and the strip were pictures only, and the new item sat at the end. Now the count
 * is every page (a text page is a page of the book, 1.6), the strip is every item, around the one
 * the author is working on (`shownItemIndex` — the canvas shows the same one), and a text item being
 * worked on is typed right here. A strip face picks an item to work on.
 */
export function SequencePagesControl({
  elementId,
  title,
  items,
  listView,
  compositions,
  firstComposition,
  dir,
  textDigits,
}: {
  elementId: string;
  title: string;
  items: readonly SequenceItem[];
  /** The sequence's item editor, shown by the manager's List view. */
  listView: ReactNode;
  compositions: readonly CompositionChoice[];
  firstComposition: string | undefined;
  dir: 'ltr' | 'rtl';
  textDigits: (itemId: string) => FieldDigits | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  // The text item this card just added: its box takes the focus once it is drawn.
  const [typeInto, setTypeInto] = useState<string | null>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const focus = useDesignerSelector((st) => shownItemIndex(st, elementId, items));
  const pictures = items.filter(isPicture).length;
  const word = itemWord(items);
  const { from, to } = stripWindow(items.length, focus, STRIP);
  const worked = focus === null ? undefined : items[focus];
  const workedText = worked !== undefined && 'text' in worked ? worked : undefined;

  useEffect(() => {
    if (typeInto === null || workedText?.id !== typeInto) return;
    textBox.current?.focus();
    setTypeInto(null);
  }, [typeInto, workedText?.id]);

  return (
    <div className={s.summary}>
      {pictures > 0 && (
        <>
          <StateLine tone="text" testId="sequence-page-count">
            {itemCountText(items)}
          </StateLine>
          <div className={s.strip}>
            {from > 0 && <span className={s.more}>{`+${String(from)}`}</span>}
            {items.slice(from, to).map((item, i) => (
              <StripFace
                key={item.id}
                item={item}
                number={from + i + 1}
                word={word}
                current={focus === from + i}
                compositions={compositions}
                onPick={() => designerStore.focusSequenceItem({ elementId, itemId: item.id })}
              />
            ))}
            {items.length > to && <span className={s.more}>{`+${String(items.length - to)}`}</span>}
          </div>
          {workedText !== undefined && focus !== null && (
            <Textarea
              key={workedText.id}
              ref={textBox}
              className={s.workedText}
              value={shown(workedText.text, textDigits(workedText.id))}
              dir={dir}
              placeholder="Text"
              aria-label={`Text of ${word} ${String(focus + 1)}`}
              title={`The text ${word} ${String(focus + 1)} shows`}
              onChange={(e) => {
                const text = typedInto(e.currentTarget, e.nativeEvent, textDigits(workedText.id));
                designerStore.setSequenceItems(
                  elementId,
                  items.map((it) =>
                    it.id === workedText.id ? ({ ...it, text } as SequenceItem) : it,
                  ),
                );
              }}
            />
          )}
          <Button
            variant="secondary"
            title="See every item of the sequence and arrange it: thumbnails, drag, sort, remove"
            onClick={() => setOpen(true)}
          >
            Manage pages…
          </Button>
        </>
      )}
      {/* With no pictures the item editor sits below this card and adds text and composition
          items itself; a book has no editor here, so its card adds every kind. */}
      <PageAddButtons
        elementId={elementId}
        items={items}
        firstComposition={firstComposition}
        picturesOnly={pictures === 0}
        onAdded={(item) => {
          if ('text' in item) setTypeInto(item.id);
        }}
      />
      {open && (
        <PagesModal
          elementId={elementId}
          title={title}
          items={items}
          listView={listView}
          editing={{ compositions, dir, textDigits }}
          firstComposition={firstComposition}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** One face of the strip: a picture's thumbnail, a text item's words, a composition's mark. */
function StripFace({
  item,
  number,
  word,
  current,
  compositions,
  onPick,
}: {
  item: SequenceItem;
  number: number;
  word: 'page' | 'item';
  current: boolean;
  compositions: readonly CompositionChoice[];
  onPick: () => void;
}): JSX.Element {
  const picture = isPicture(item);
  const thumb = usePageThumb(picture ? item.assetId : undefined);
  const composition = !picture && 'compositionId' in item ? item.compositionId : undefined;
  const name =
    composition !== undefined
      ? (compositions.find((c) => c.id === composition)?.name ?? 'Composition')
      : itemLabel(item) || 'Text';
  return (
    <Control
      variant="bare"
      className={cx(s.stripThumb, s.stripFace, current && s.stripCurrent)}
      aria-label={`Show ${word} ${String(number)} on the canvas`}
      aria-pressed={current}
      title={`${word === 'page' ? 'Page' : 'Item'} ${String(number)}: ${name}`}
      data-strip-current={current ? String(number) : undefined}
      onClick={onPick}
    >
      {picture ? (
        thumb !== null && <img src={thumb} alt="" className={s.thumbImg} draggable={false} />
      ) : composition !== undefined ? (
        <Icon icon={LayoutTemplate} size={14} />
      ) : 'text' in item && item.text !== '' ? (
        <span className={s.stripText}>{item.text}</span>
      ) : (
        <Icon icon={Type} size={14} />
      )}
    </Control>
  );
}
