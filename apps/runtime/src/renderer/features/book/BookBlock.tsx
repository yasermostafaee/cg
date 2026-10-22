import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Images,
  ListOrdered,
} from 'lucide-react';
import { REFERENCE_RASTER } from '@cg/shared-ipc';
import type { FieldValue, ImageFit } from '@cg/shared-schema';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Tag } from '../../ui/Tag.js';
import { TextInput } from '../../ui/TextInput.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import type { RowBook } from '../layers/bookOf.js';
import {
  bookPagesOf,
  isPicturePage,
  pagesAroundCurrent,
  withPicturesReplaced,
  type BookPage,
} from './bookPages.js';
import { bookSent, bookSource, bookSourceText, bookSourceWords, pictureName } from './bookFacts.js';
import {
  dragCarriesFiles,
  droppedPictures,
  loadPictureFiles,
  loadPictures,
  type LoadOutcome,
} from './loadPictures.js';
import type { Raster } from './fitPicture.js';
import { ContextMenu } from '../../ui/ContextMenu.js';
import { useAuthoredPictures } from './authoredPictures.js';
import { ManagePagesModal } from './ManagePagesModal.js';
import { useRehearse } from '../../hooks/useRehearse.js';
import {
  ensurePicture,
  MISSING_PICTURE_URL,
  pictureMissing,
  pictureObjectUrl,
  picturesVersion,
  subscribePictures,
} from './pagePictures.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.4 — **A ROW'S BOOK IN THE INSPECTOR: one block, on one grid, visibly BOUND.**
 *
 * The owner (2026-10-21): the Next etc. buttons must be tidy, aligned and clearer, and once a folder is
 * chosen it must be clear the files are bound. So the block says, always:
 *
 * - WHERE its pages come from (`Template's pictures`, `Folder "IN" · 87 pictures`, `Picked pictures · 12`)
 *   and WHETHER they are on the row (`Not sent — press Update` / `On the row`);
 * - WHICH pages are around the one the row is on: the page before, that page, the page after;
 *
 * and offers two rows of controls: turning (`Previous`, the page box with ` / 87`, `Next`, `Go`) and
 * loading (`Load pages… ▾` — `Pictures…` / `Folder…` — and `Manage pages…`; delta A: one load button, and
 * files or a folder dropped on the block load the same way). Its heading is the book's name, never
 * its field id (`bookTitle`). Built from the console's primitives only; its grid is `controls.css`'s
 * `.cg-book`. Labels, values and facts — no sentence explains it.
 */
export interface BookBlockProps {
  itemId: string;
  fieldId: string;
  /** The book's name (`bookTitle`): its controls' accessible names say it. */
  title: string;
  /** The book PVW and Update see: the staged value over the applied one. */
  value: FieldValue | undefined;
  /** The template's own pages. */
  defaults: readonly unknown[];
  /** The value is staged and not yet applied. */
  dirty: boolean;
  /** The row's channel — its frame is what a picture is fitted to. */
  channel: number | undefined;
  templateId: string;
  /** The row's turning state (`bookOf`); `null` for a book the author's sequence turns by itself. */
  book: RowBook | null;
  onStage: (value: FieldValue) => void;
  /** `RUN-NEXT-VERSION-03` 1.5 — the book ON the row (applied), for the page on air in `Manage pages…`. */
  applied: FieldValue | undefined;
  /** The row is on air (`isOnAirStatus`). */
  onAir: boolean;
  /**
   * `RUN-NEXT-VERSION-03` delta A — the sequence's picture fit (`TemplateInfo.pageLists[].fit`): every
   * page face is drawn at it. Absent (a template imported before it) is `contain`, the default.
   */
  fit?: ImageFit | undefined;
}

/** One way of getting pictures in — the picker, or a drop — told how far it is. */
type Loader = (progress: (done: number, total: number) => void) => Promise<LoadOutcome | null>;

export function BookBlock({
  itemId,
  fieldId,
  title,
  value,
  defaults,
  dirty,
  channel,
  templateId,
  book,
  onStage,
  applied,
  onAir,
  fit = 'contain',
}: BookBlockProps): JSX.Element {
  const loaded = Array.isArray(value);
  const pages = bookPagesOf(loaded ? value : defaults);
  const appliedPages = bookPagesOf(Array.isArray(applied) ? applied : defaults);
  const inPvw = useRehearse().some((r) => r.itemId === itemId);
  const authored = useAuthoredPictures(templateId, channel);
  const [managing, setManaging] = useState(false);
  const source = bookSource(pages, loaded);
  const words = bookSourceWords(source);
  const current = Math.min(Math.max(0, (book?.page ?? 1) - 1), Math.max(0, pages.length - 1));
  const settings = useChannelSettings().settings;
  const raster = settings.find((s) => s.channel === channel)?.raster ?? REFERENCE_RASTER;
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [fitted, setFitted] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);

  /** Every load — picked pictures, a picked folder, or a drop — REPLACES the book's pictures (1.6). */
  async function load(outcomeOf: Loader): Promise<void> {
    setFitted(null);
    setRefusal(null);
    try {
      const outcome = await outcomeOf((done, total) => setBusy({ done, total }));
      if (outcome === null) return;
      setFitted(outcome.fitted);
      setRefusal(outcome.refusal);
      // `RUN-NEXT-VERSION-03` 1.6 — the PICTURE pages are replaced; each text page keeps its place.
      if (outcome.pages.length > 0) {
        onStage(withPicturesReplaced(pages, outcome.pages) as unknown as FieldValue);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="cg-book"
      data-book={fieldId}
      {...(dropping ? { 'data-drop-target': '' } : {})}
      onDragOver={(e) => {
        if (!dragCarriesFiles(e.dataTransfer) || busy !== null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!dragCarriesFiles(e.dataTransfer) || busy !== null) return;
        e.preventDefault();
        setDropping(false);
        // Read now: the drop's items are gone once this handler returns.
        const dropped = droppedPictures(e.dataTransfer);
        void load(async (progress) => loadPictureFiles(await dropped, raster, progress));
      }}
    >
      {dropping && (
        <span className="cg-drop-hint" aria-hidden="true">
          Drop to replace the pictures
        </span>
      )}
      <div className="cg-book__facts">
        <Tag className="cg-meta-chip" data-book-source={source.kind} title={bookSourceText(source)}>
          {words.head}
          {source.folder !== undefined && <bdi>{source.folder}</bdi>}
          {words.tail}
        </Tag>
        <Tag className="cg-meta-chip" data-book-sent={dirty ? 'staged' : 'on-row'}>
          {bookSent(dirty)}
        </Tag>
        <span className="cg-book-count" data-testid={`page-count-${fieldId}`}>
          {pages.length === 1 ? '1 page' : `${String(pages.length)} pages`}
        </span>
      </div>
      <BookStrip
        title={title}
        pages={pages}
        current={current}
        book={book}
        authored={authored}
        fit={fit}
        raster={raster}
      />
      {book !== null && <BookTurn itemId={itemId} title={title} book={book} />}
      <div className="cg-book__row" data-book-load="">
        {/*
          🔴 `RUN-NEXT-VERSION-03` delta A — ONE load button (the owner's choice): a browser's picker takes
          files OR a folder, never both, so the button opens a two-item menu. Every load here REPLACES the
          book's pictures (each text page keeps its place, 1.6) — the menu's items say so in their title,
          and a drop says so while it is held over the block.
        */}
        <Button
          variant="neutral"
          aria-label={`Load pages for ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuAt !== null}
          disabled={busy !== null}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAt({ x: r.left, y: r.bottom + 2 });
          }}
        >
          <Icon icon={Images} size={13} />
          {busy === null ? 'Load pages…' : `Loading ${String(busy.done)} / ${String(busy.total)}…`}
          <Icon icon={ChevronDown} size={13} />
        </Button>
        <Button
          variant="neutral"
          aria-label={`Manage pages of ${title}`}
          disabled={busy !== null}
          onClick={() => setManaging(true)}
        >
          <Icon icon={ListOrdered} size={13} />
          Manage pages…
        </Button>
      </div>
      {menuAt !== null && (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          ariaLabel={`Load pages for ${title}`}
          onClose={() => setMenuAt(null)}
          items={[
            {
              label: 'Pictures…',
              icon: Images,
              title: "Replaces the book's pictures; text pages keep their places",
              onSelect: () => void load((progress) => loadPictures(false, raster, progress)),
            },
            {
              label: 'Folder…',
              icon: FolderOpen,
              title: "Replaces the book's pictures with a folder's; text pages keep their places",
              onSelect: () => void load((progress) => loadPictures(true, raster, progress)),
            },
          ]}
        />
      )}
      {fitted !== null && (
        <span className="cg-book-count" data-testid="page-fit-line">
          {fitted}
        </span>
      )}
      {refusal !== null && <Notice noticeRole="refusal" text={refusal} />}
      {managing && (
        <ManagePagesModal
          title={title}
          pages={pages}
          appliedPages={appliedPages}
          current={current}
          onAir={onAir}
          inPvw={inPvw}
          raster={raster}
          fit={fit}
          authored={authored}
          onDone={(next) => {
            // `RUN-NEXT-VERSION-03` 1.5 — STAGED, like every Inspector edit: Update sends it.
            onStage(next as unknown as FieldValue);
            setManaging(false);
          }}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  );
}

/**
 * Up to three pages around the one the row is on (`pagesAroundCurrent`: never an empty box), each as the
 * operator will see it, the current one marked wherever it sits. Nothing moves when a page turns: the
 * strip is always three equal columns of frame-shaped faces (`controls.css`'s `.cg-book__strip`).
 */
function BookStrip({
  title,
  pages,
  current,
  book,
  authored,
  fit,
  raster,
}: {
  title: string;
  pages: readonly BookPage[];
  current: number;
  book: RowBook | null;
  authored: Readonly<Record<string, string>>;
  fit: ImageFit;
  raster: Raster;
}): JSX.Element {
  return (
    <div
      className="cg-book__strip"
      role="group"
      aria-label={`${title} — pages around the current one`}
    >
      {pagesAroundCurrent(pages.length, current).map((index, slot) => {
        const page = pages[index];
        const isCurrent = index === current;
        return (
          <figure
            key={slot}
            className="cg-book-thumb"
            data-book-thumb={isCurrent ? 'current' : index < current ? 'before' : 'after'}
            {...(isCurrent ? { 'data-current': '' } : {})}
          >
            <PageFrame page={page} authored={authored} fit={fit} raster={raster} />
            {/* A number readout is LTR chrome: in an RTL context `1 / 4` would be drawn `4 / 1`. */}
            <figcaption
              className="cg-book-thumb__num"
              dir="ltr"
              {...(isCurrent ? { 'data-testid': 'book-counter' } : {})}
            >
              {isCurrent
                ? `${String(book?.page ?? index + 1)} / ${String(book?.count ?? pages.length)}`
                : String(index + 1)}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * `RUN-NEXT-VERSION-03` delta A — **ONE PAGE AS THE AIR SHOWS IT**: the channel's frame shape (the row's
 * raster) on PVW's checker, the picture at the sequence's own picture fit. The strip and `Manage pages…`
 * both draw a page through this — never a second treatment.
 */
export function PageFrame({
  page,
  authored,
  fit,
  raster,
}: {
  page: BookPage | undefined;
  authored: Readonly<Record<string, string>>;
  fit: ImageFit;
  raster: Raster;
}): JSX.Element {
  return (
    <div
      className="cg-book-thumb__frame"
      data-page-fit={fit}
      style={{ aspectRatio: `${String(raster.width)} / ${String(raster.height)}` }}
    >
      {page !== undefined && <PageFace page={page} authored={authored} fit={fit} raster={raster} />}
    </div>
  );
}

/** One page's face: its picture placed at the sequence's fit, or a text page's words. */
export function PageFace({
  page,
  authored,
  fit,
  raster,
}: {
  page: BookPage;
  authored: Readonly<Record<string, string>>;
  fit: ImageFit;
  raster: Raster;
}): JSX.Element {
  useSyncExternalStore(subscribePictures, picturesVersion, picturesVersion);
  // `none` draws the picture at its own size against the channel: its box needs its natural size.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const media = isPicturePage(page) ? page.media : undefined;
  useEffect(() => {
    if (media !== undefined) void ensurePicture(media);
  }, [media]);
  if (!isPicturePage(page)) {
    return (
      <span className="cg-book-thumb__text" dir="auto">
        <bdi>{page.text}</bdi>
      </span>
    );
  }
  // A picture still being read draws an empty frame; one that cannot be had, the wordless
  // placeholder PVW draws too — never its file name in its place (the name is in the tooltip).
  const url =
    page.media !== undefined
      ? (pictureObjectUrl(page.media) ??
        (pictureMissing(page.media) ? MISSING_PICTURE_URL : undefined))
      : page.assetId !== undefined
        ? (authored[page.assetId] ?? MISSING_PICTURE_URL)
        : MISSING_PICTURE_URL;
  const name = pictureName(page.name);
  return url === undefined ? (
    <span aria-hidden="true" />
  ) : (
    <img
      className="cg-page-pic"
      data-fit={fit}
      src={url}
      alt={name}
      title={name}
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget;
        setNatural({ width: img.naturalWidth, height: img.naturalHeight });
      }}
      style={
        fit === 'none' && natural !== null
          ? {
              width: `${String((natural.width / raster.width) * 100)}%`,
              height: `${String((natural.height / raster.height) * 100)}%`,
            }
          : undefined
      }
    />
  );
}

/**
 * `R-100` — **TURN THE ROW'S BOOK**: Previous, the page box (the page the row is on, in any digit set;
 * type another and press Go or Enter), ` / count`, Next, Go. Every press is one `stack.page`; the bridge
 * owns the number and answers it, so the box always reads what the bridge holds. On a row with nothing
 * on its layer a turn changes the number only (golden rule 10).
 */
function BookTurn({
  itemId,
  title,
  book,
}: {
  itemId: string;
  title: string;
  book: RowBook;
}): JSX.Element {
  const [typed, setTyped] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function turn(to: 'next' | 'previous' | number): Promise<void> {
    setBusy(true);
    try {
      const r = await window.cg.stack.page({ itemId, field: book.fieldId, to });
      setRefusal(
        r.accepted ? null : (r.message ?? `The page did not turn (${r.errorCode ?? 'refused'}).`),
      );
    } finally {
      setBusy(false);
      setTyped(null);
    }
  }

  const shown = typed ?? (book.count === 0 ? '' : String(book.page));
  const target = typed === null ? null : parseLocalizedNumber(typed.trim());
  const goable = target !== null && Number.isInteger(target) && target >= 1;
  const none = book.count === 0;

  return (
    <div data-book-bar="">
      <div className="cg-book__row cg-book__turn">
        <Button
          variant="neutral"
          aria-label={`Previous page of ${title}`}
          disabled={busy || none || (!book.wrap && book.page <= 1)}
          onClick={() => void turn('previous')}
        >
          <Icon icon={ChevronLeft} size={13} flipRtl />
          Previous
        </Button>
        {/* The page box and its ` / 87` are one LTR readout, whatever the panel's direction. */}
        <span className="cg-book__page" dir="ltr">
          <TextInput
            className="cg-book-page"
            value={shown}
            onChange={setTyped}
            inputMode="numeric"
            aria-label={`Page number of ${title}`}
            disabled={busy || none}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && goable && target !== null) void turn(target);
              if (e.key === 'Escape') setTyped(null);
            }}
          />
          <span className="cg-book__of" aria-hidden="true">
            {`/ ${String(book.count)}`}
          </span>
        </span>
        <Button
          variant="neutral"
          aria-label={`Next page of ${title}`}
          disabled={busy || none || (!book.wrap && book.page >= book.count)}
          onClick={() => void turn('next')}
        >
          Next
          <Icon icon={ChevronRight} size={13} flipRtl />
        </Button>
        <Button
          variant="neutral"
          aria-label={`Go to page in ${title}`}
          disabled={busy || none || !goable}
          onClick={() => {
            if (target !== null) void turn(target);
          }}
        >
          Go
        </Button>
      </div>
      {refusal !== null && <Notice noticeRole="refusal" text={refusal} />}
    </div>
  );
}
