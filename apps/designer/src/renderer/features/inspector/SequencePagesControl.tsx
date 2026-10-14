import { useState, type ReactNode } from 'react';
import type { FieldDigits, SequenceImageItem, SequenceItem } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import type { CompositionChoice } from '../fields/ListItemsEditor.js';
import { StateLine } from './InfoTip.js';
import { PageAddButtons } from './PageAddButtons.js';
import { isPicture } from './pageItems.js';
import { PagesModal } from './PagesModal.js';
import { usePageThumb } from './pageThumbs.js';
import * as s from './Pages.css.js';

/** How many pages the Inspector's card shows before `+N`. */
const STRIP = 4;

/**
 * `D-163` — **A BOOK'S PAGES IN THE INSPECTOR: a card, not a list.** The count, the first few pages
 * as thumbnails, and `Manage pages…`, which opens the Pages manager where every item is seen and
 * arranged. The add row — pictures, a folder, a text item, a composition item — is the manager's
 * own. A 300-page book costs the Inspector these few lines, exactly as a 3-page one does (the
 * owner's report: a row per page filled the panel).
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
  const pictures = items.filter(isPicture);
  const shown = pictures.slice(0, STRIP);

  return (
    <div className={s.summary}>
      {pictures.length > 0 && (
        <>
          <StateLine tone="text" testId="sequence-page-count">
            {pictures.length === 1 ? '1 page' : `${String(pictures.length)} pages`}
          </StateLine>
          <div className={s.strip} aria-hidden="true">
            {shown.map((page) => (
              <StripThumb key={page.id} page={page} />
            ))}
            {pictures.length > shown.length && (
              <span className={s.more}>{`+${String(pictures.length - shown.length)}`}</span>
            )}
          </div>
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
        picturesOnly={pictures.length === 0}
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

function StripThumb({ page }: { page: SequenceImageItem }): JSX.Element {
  const thumb = usePageThumb(page.assetId);
  return (
    <span className={s.stripThumb}>
      {thumb !== null && <img src={thumb} alt="" className={s.thumbImg} draggable={false} />}
    </span>
  );
}
