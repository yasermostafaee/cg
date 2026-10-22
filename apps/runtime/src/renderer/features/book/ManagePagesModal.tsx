import { useState, type DragEvent } from 'react';
import {
  ArrowDownAZ,
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  FolderSync,
  Images,
  Pencil,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { pageAfterBookChange, pageIdsOf } from '@cg/shared-ipc';
import { AutoGrowTextarea } from '../../ui/AutoGrowTextarea.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction, type ModalMessage } from '../../ui/Modal.js';
import { Tag } from '../../ui/Tag.js';
import type { ImageFit } from '@cg/shared-schema';
import { PageFrame } from './BookBlock.js';
import { pictureName } from './bookFacts.js';
import {
  freshTextPageId,
  isPicturePage,
  movePage,
  withPicturesReplaced,
  withPicturesSortedByName,
  withUniqueIds,
  type BookPage,
} from './bookPages.js';
import {
  dragCarriesFiles,
  droppedPictures,
  loadPictureFiles,
  loadPictures,
  type PictureFile,
} from './loadPictures.js';
import type { Raster } from './fitPicture.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.5 — **`Manage pages…`: THE OPERATOR'S TOOL FOR A BOOK.** The owner: arranging,
 * sorting and managing a book's pictures happens in CG Control (in the Designer the folder is only for
 * testing). In the app's shared Modal:
 *
 * - a numbered grid of the pages, the page ON AIR and the page in PVW marked;
 * - drag to reorder — and `Move earlier` / `Move later` on every page, the keyboard path;
 * - `Remove` per page, and the pages selected (`Select`) removed together;
 * - `Sort by name` (natural order; text pages keep their places);
 * - `Add pictures…`, `Add folder…` (appended), `Replace with folder…` (the pictures only — each text page
 *   keeps its place; 1.6), and files or a folder dropped on the dialog (appended; delta A), all through
 *   1.2's fitting;
 * - `Add text page`, and a text page's words edited in place.
 *
 * Its edits STAGE, like every Inspector edit: `Done` puts the book in the row's draft, and `Discard`
 * and `Update` keep their meaning — nothing reaches air before Update. On a book that is on air the
 * page on screen stays on screen; when the edit removes it, the dialog says which page takes its place
 * (`pageAfterBookChange`, the bridge's own rule).
 */
export interface ManagePagesModalProps {
  /** The book's name. */
  title: string;
  /** The pages the dialog opens on: the row's book as staged (or applied, or the template's own). */
  pages: readonly BookPage[];
  /** The pages ON the row (what the bridge holds), for the page on air and what replaces it. */
  appliedPages: readonly BookPage[];
  /** The page the row is on (0-based). */
  current: number;
  /** The row is on air: the current applied page is marked `On air`. */
  onAir: boolean;
  /** The row is in PVW: the current page of the opened book is marked `PVW`. */
  inPvw: boolean;
  /** The row's channel frame — what an added picture is fitted to, and every page's frame shape. */
  raster: Raster;
  /** `RUN-NEXT-VERSION-03` delta A — the sequence's picture fit: every page is drawn at it. */
  fit: ImageFit;
  /** The template's own pictures, by asset id. */
  authored: Readonly<Record<string, string>>;
  /** Stage the edited book. */
  onDone: (pages: BookPage[]) => void;
  onClose: () => void;
}

export function ManagePagesModal({
  title,
  pages,
  appliedPages,
  current,
  onAir,
  inPvw,
  raster,
  fit,
  authored,
  onDone,
  onClose,
}: ManagePagesModalProps): JSX.Element {
  const [draft, setDraft] = useState<BookPage[]>(() => [...pages]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [lines, setLines] = useState<ModalMessage[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const onAirId = onAir ? appliedPages[current]?.id : undefined;
  const pvwId = inPvw ? pages[Math.min(current, pages.length - 1)]?.id : undefined;

  /** Pictures picked (a folder, or files) or dropped: appended, or replacing the pictures (1.6). */
  async function add(
    from: boolean | Promise<readonly PictureFile[]>,
    replace: boolean,
  ): Promise<void> {
    setLines([]);
    try {
      const progress = (done: number, total: number): void => setBusy({ done, total });
      const outcome =
        typeof from === 'boolean'
          ? await loadPictures(from, raster, progress)
          : await loadPictureFiles(await from, raster, progress);
      if (outcome === null) return;
      const said: ModalMessage[] = [];
      if (outcome.fitted !== null) said.push({ role: 'notice', text: outcome.fitted });
      if (outcome.refusal !== null) said.push({ role: 'refusal', text: outcome.refusal });
      setLines(said);
      if (outcome.pages.length === 0) return;
      setDraft((now) =>
        replace
          ? withPicturesReplaced(now, withUniqueIds([], outcome.pages))
          : [...now, ...withUniqueIds(now, outcome.pages)],
      );
    } finally {
      setBusy(null);
    }
  }

  const removeIds = (ids: ReadonlySet<string>): void => {
    setDraft((now) => now.filter((p) => !ids.has(p.id)));
    setSelected(new Set());
    if (editing !== null && ids.has(editing)) setEditing(null);
  };

  const move = (from: number, to: number): void => setDraft((now) => movePage(now, from, to));

  const addTextPage = (): void => {
    const id = freshTextPageId(draft);
    setDraft([...draft, { id, text: '' }]);
    setEditing(id);
  };

  const onDrop = (e: DragEvent<HTMLElement>, to: number): void => {
    // A drop of files is the dialog's (it adds them); only a tile being moved is handled here.
    if (dragging === null) return;
    e.preventDefault();
    e.stopPropagation();
    const from = draft.findIndex((p) => p.id === dragging);
    setDragging(null);
    if (from >= 0) move(from, to);
  };

  /*
    The page on air, said when this edit would take it off screen: which page stands in its place at
    Update (the bridge's own rule). Moved, it simply stays — nothing to say.
  */
  const appliedIds = pageIdsOf(appliedPages);
  const onAirGone = onAirId !== undefined && !draft.some((p) => p.id === onAirId);
  const nextIndex = onAirGone ? pageAfterBookChange(appliedIds, current, pageIdsOf(draft)) : -1;
  const message: ModalMessage[] = [
    ...lines,
    ...(onAirGone
      ? [
          {
            role: 'notice' as const,
            text:
              draft.length === 0
                ? `Page ${String(current + 1)} is on air and is removed; at Update the book has no pages.`
                : `Page ${String(current + 1)} is on air and is removed; at Update, page ${String(nextIndex + 1)} takes its place.`,
          },
        ]
      : []),
  ];

  const editingIndex = editing === null ? -1 : draft.findIndex((p) => p.id === editing);
  const editingPage = editingIndex < 0 ? undefined : draft[editingIndex];

  return (
    <Modal
      title="Manage pages"
      subtitle={
        <>
          <bdi>{title}</bdi> · {draft.length === 1 ? '1 page' : `${String(draft.length)} pages`}
        </>
      }
      emblem={Images}
      size="wide"
      frame="fixed"
      onClose={onClose}
      {...(message.length > 0 ? { message } : {})}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onClose}>
            Cancel
          </ModalAction>
          <ModalAction
            actionRole="primary"
            disabled={busy !== null}
            data-manage-done=""
            onClick={() => onDone(draft)}
          >
            Done
          </ModalAction>
        </>
      }
    >
      {/*
        `RUN-NEXT-VERSION-03` delta A — files or a folder dropped on the dialog are ADDED at the end, through
        the same fitting (1.2); a tile dragged inside it still reorders (it carries no files).
      */}
      <div
        className="cg-pages"
        data-manage-pages=""
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
          void add(droppedPictures(e.dataTransfer), false);
        }}
      >
        {dropping && (
          <span className="cg-drop-hint" aria-hidden="true">
            Drop to add pages
          </span>
        )}
        <div className="cg-pages__tools" role="toolbar" aria-label={`${title} — page tools`}>
          <Button variant="neutral" disabled={busy !== null} onClick={() => void add(false, false)}>
            <Icon icon={FilePlus2} size={13} />
            {busy === null
              ? 'Add pictures…'
              : `Loading ${String(busy.done)} / ${String(busy.total)}…`}
          </Button>
          <Button variant="neutral" disabled={busy !== null} onClick={() => void add(true, false)}>
            <Icon icon={FolderOpen} size={13} />
            Add folder…
          </Button>
          <Button variant="neutral" disabled={busy !== null} onClick={() => void add(true, true)}>
            <Icon icon={FolderSync} size={13} />
            Replace with folder…
          </Button>
          <Button variant="neutral" disabled={busy !== null} onClick={addTextPage}>
            <Icon icon={Type} size={13} />
            Add text page
          </Button>
          <Button
            variant="neutral"
            disabled={busy !== null || draft.filter(isPicturePage).length < 2}
            onClick={() => setDraft((now) => withPicturesSortedByName(now))}
          >
            <Icon icon={ArrowDownAZ} size={13} />
            Sort by name
          </Button>
          <Button
            variant="neutral"
            disabled={selected.size === 0}
            onClick={() => removeIds(selected)}
          >
            <Icon icon={Trash2} size={13} />
            {selected.size === 0 ? 'Remove selected' : `Remove ${String(selected.size)} selected`}
          </Button>
        </div>
        <ol className="cg-pages__grid" aria-label={`${title} — pages`}>
          {draft.map((page, i) => {
            const n = i + 1;
            const isSelected = selected.has(page.id);
            const label = isPicturePage(page) ? pictureName(page.name) : page.text;
            return (
              <li
                key={page.id}
                className="cg-page-tile"
                data-page-tile={String(n)}
                data-page-id={page.id}
                {...(isSelected ? { 'data-selected': '' } : {})}
                {...(dragging === page.id ? { 'data-dragging': '' } : {})}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDragging(page.id);
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, i)}
              >
                <div className="cg-page-tile__head">
                  <span className="cg-page-tile__num">{String(n)}</span>
                  {page.id === onAirId && (
                    <Tag className="cg-meta-chip" data-page-mark="air">
                      On air
                    </Tag>
                  )}
                  {page.id === pvwId && (
                    <Tag className="cg-meta-chip" data-page-mark="pvw">
                      PVW
                    </Tag>
                  )}
                </div>
                <PageFrame page={page} authored={authored} fit={fit} raster={raster} />
                <span className="cg-page-tile__name" title={label}>
                  <bdi>{isPicturePage(page) ? label : label === '' ? 'Text page' : label}</bdi>
                </span>
                <div className="cg-page-tile__tools">
                  <Button
                    variant="icon"
                    aria-pressed={isSelected}
                    aria-label={`Select page ${String(n)}`}
                    title="Select"
                    onClick={() =>
                      setSelected((now) => {
                        const next = new Set(now);
                        if (next.has(page.id)) next.delete(page.id);
                        else next.add(page.id);
                        return next;
                      })
                    }
                  >
                    <Icon icon={isSelected ? Check : Square} size={13} />
                  </Button>
                  <Button
                    variant="icon"
                    aria-label={`Move page ${String(n)} earlier`}
                    title="Move earlier"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <Icon icon={ChevronLeft} size={13} flipRtl />
                  </Button>
                  <Button
                    variant="icon"
                    aria-label={`Move page ${String(n)} later`}
                    title="Move later"
                    disabled={i === draft.length - 1}
                    onClick={() => move(i, i + 2)}
                  >
                    <Icon icon={ChevronRight} size={13} flipRtl />
                  </Button>
                  {!isPicturePage(page) && (
                    <Button
                      variant="icon"
                      aria-label={`Edit page ${String(n)}`}
                      title="Edit"
                      onClick={() => setEditing(page.id)}
                    >
                      <Icon icon={Pencil} size={13} />
                    </Button>
                  )}
                  <Button
                    variant="icon"
                    aria-label={`Remove page ${String(n)}`}
                    title="Remove"
                    onClick={() => removeIds(new Set([page.id]))}
                  >
                    <Icon icon={Trash2} size={13} />
                  </Button>
                </div>
              </li>
            );
          })}
          {/* A drop past the last page appends. */}
          <li
            className="cg-pages__end"
            aria-hidden="true"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, draft.length)}
          />
        </ol>
        {editingPage !== undefined && !isPicturePage(editingPage) && (
          <div className="cg-pages__editor" data-text-page-editor="">
            <span className="cg-pages__editor-label">{`Text of page ${String(editingIndex + 1)}`}</span>
            <AutoGrowTextarea
              className="cg-field"
              dir="auto"
              value={editingPage.text}
              aria-label={`Text of page ${String(editingIndex + 1)}`}
              onChange={(e) => {
                const text = e.currentTarget.value;
                const id = editingPage.id;
                setDraft((now) => now.map((p) => (p.id === id ? { ...p, text } : p)));
              }}
            />
            <Button variant="neutral" onClick={() => setEditing(null)}>
              Done editing
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
