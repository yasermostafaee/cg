import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Images, ListOrdered } from 'lucide-react';
import { REFERENCE_RASTER } from '@cg/shared-ipc';
import type { FieldValue } from '@cg/shared-schema';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Notice } from '../../ui/Notice.js';
import { Tag } from '../../ui/Tag.js';
import { TextInput } from '../../ui/TextInput.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import type { RowBook } from '../layers/bookOf.js';
import { bookPagesOf, isPicturePage, withPicturesReplaced, type BookPage } from './bookPages.js';
import { bookSent, bookSource, bookSourceText, bookSourceWords, pictureName } from './bookFacts.js';
import { loadPictures } from './loadPictures.js';
import { useAuthoredPictures } from './authoredPictures.js';
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
 * loading (`Load pictures…`, `Load folder…`, `Manage pages…`). Its heading is the book's name, never
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
  /** `RUN-NEXT-VERSION-03` 1.5 — open `Manage pages…`; absent while it is not offered. */
  onManage?: (() => void) | undefined;
}

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
  onManage,
}: BookBlockProps): JSX.Element {
  const loaded = Array.isArray(value);
  const pages = bookPagesOf(loaded ? value : defaults);
  const source = bookSource(pages, loaded);
  const words = bookSourceWords(source);
  const current = Math.min(Math.max(0, (book?.page ?? 1) - 1), Math.max(0, pages.length - 1));
  const settings = useChannelSettings().settings;
  const raster = settings.find((s) => s.channel === channel)?.raster ?? REFERENCE_RASTER;
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [fitted, setFitted] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function load(folder: boolean): Promise<void> {
    setFitted(null);
    setRefusal(null);
    try {
      const outcome = await loadPictures(folder, raster, (done, total) => setBusy({ done, total }));
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
    <div className="cg-book" data-book={fieldId}>
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
        templateId={templateId}
        channel={channel}
      />
      {book !== null && <BookTurn itemId={itemId} title={title} book={book} />}
      <div className="cg-book__row" data-book-load="">
        <Button
          variant="neutral"
          aria-label={`Load pictures for ${title}`}
          disabled={busy !== null}
          onClick={() => void load(false)}
        >
          <Icon icon={Images} size={13} />
          {busy === null
            ? 'Load pictures…'
            : `Loading ${String(busy.done)} / ${String(busy.total)}…`}
        </Button>
        <Button
          variant="neutral"
          aria-label={`Load a folder for ${title}`}
          disabled={busy !== null}
          onClick={() => void load(true)}
        >
          <Icon icon={FolderOpen} size={13} />
          Load folder…
        </Button>
        {onManage !== undefined && (
          <Button
            variant="neutral"
            aria-label={`Manage pages of ${title}`}
            disabled={busy !== null}
            onClick={onManage}
          >
            <Icon icon={ListOrdered} size={13} />
            Manage pages…
          </Button>
        )}
      </div>
      {fitted !== null && (
        <span className="cg-book-count" data-testid="page-fit-line">
          {fitted}
        </span>
      )}
      {refusal !== null && <Notice noticeRole="refusal" text={refusal} />}
    </div>
  );
}

/** The page before, the page the row is on, the page after — each as the operator will see it. */
function BookStrip({
  title,
  pages,
  current,
  book,
  templateId,
  channel,
}: {
  title: string;
  pages: readonly BookPage[];
  current: number;
  book: RowBook | null;
  templateId: string;
  channel: number | undefined;
}): JSX.Element {
  const authored = useAuthoredPictures(templateId, channel);
  const at = [current - 1, current, current + 1];
  return (
    <div
      className="cg-book__strip"
      role="group"
      aria-label={`${title} — pages around the current one`}
    >
      {at.map((index, slot) => {
        const page = pages[index];
        const isCurrent = slot === 1;
        return (
          <figure
            key={slot}
            className="cg-book-thumb"
            data-book-thumb={isCurrent ? 'current' : slot === 0 ? 'before' : 'after'}
            {...(isCurrent ? { 'data-current': '' } : {})}
          >
            <div className="cg-book-thumb__frame">
              {page !== undefined && <PageFace page={page} authored={authored} />}
            </div>
            <figcaption
              className="cg-book-thumb__num"
              {...(isCurrent ? { 'data-testid': 'book-counter' } : {})}
            >
              {page === undefined
                ? ''
                : isCurrent
                  ? `${String(book?.page ?? index + 1)} / ${String(book?.count ?? pages.length)}`
                  : String(index + 1)}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** One page's face: its picture, or a text page's words. */
export function PageFace({
  page,
  authored,
}: {
  page: BookPage;
  authored: Readonly<Record<string, string>>;
}): JSX.Element {
  useSyncExternalStore(subscribePictures, picturesVersion, picturesVersion);
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
    <img src={url} alt={name} title={name} draggable={false} />
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
        <span className="cg-book__page">
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
