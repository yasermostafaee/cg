import { useState, type ReactNode } from 'react';
import type { SequenceImageItem, SequenceItem } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import * as listCss from '../fields/ListItemsEditor.css.js';
import { StateLine } from './InfoTip.js';
import { isPicture } from './pageItems.js';
import { PagesModal } from './PagesModal.js';
import { usePageThumb } from './pageThumbs.js';
import { useAddPictures } from './useAddPictures.js';
import * as s from './Pages.css.js';

/** How many pages the Inspector's card shows before `+N`. */
const STRIP = 4;

/**
 * `D-163` — **A BOOK'S PAGES IN THE INSPECTOR: a card, not a list.** The count, the first few pages
 * as thumbnails, and `Manage pages…`, which opens the Pages manager where every page is seen and
 * arranged. `Add pictures…` / `Add folder…` add pages many at a time. A 300-page book costs the
 * Inspector these few lines, exactly as a 3-page one does (the owner's report: a row per page
 * filled the panel).
 */
export function SequencePagesControl({
  elementId,
  title,
  items,
  listView,
}: {
  elementId: string;
  title: string;
  items: readonly SequenceItem[];
  /** The sequence's item editor, shown by the manager's List view. */
  listView: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const { busy, add } = useAddPictures(elementId);
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
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Manage pages…
          </Button>
        </>
      )}
      <div className={listCss.pageButtons}>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void add(false)}>
          {busy === null ? 'Add pictures…' : `Adding ${String(busy.done)} / ${String(busy.total)}…`}
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void add(true)}>
          Add folder…
        </Button>
      </div>
      {open && (
        <PagesModal
          elementId={elementId}
          title={title}
          items={items}
          listView={listView}
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
