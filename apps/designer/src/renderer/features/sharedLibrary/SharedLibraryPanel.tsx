import { useEffect, useMemo, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Element } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { ImportingThumb } from '../assets/ImportingThumb.js';
import { useImportPending } from '../assets/useImportPending.js';
import { partitionSupported, skippedFilesMessage } from '../../../shared/asset-types.js';
import { GridIcon, ListIcon } from '../assets/ProjectAssetsPanel.js';
import { fileExt, formatBytes } from '../assets/AssetThumb.js';
import { emitSharedImageRemoved, useSharedImages, useSharedImageUrl } from './useSharedImages.js';
import { revoke as revokeSharedUrl } from './sharedImageUrlCache.js';
import {
  getActiveSharedImage,
  setActiveSharedImage,
  subscribeActiveSharedImage,
} from './activeSharedImage.js';
import * as ps from '../assets/ProjectAssetsPanel.css.js';
import * as ts from '../assets/AssetThumb.css.js';
import * as s from './SharedLibraryPanel.css.js';

/** Persisted grid/list preference for the Shared Library panel (independent of Project Assets). */
const SHARED_VIEW_KEY = 'cg.designer.sharedLibraryView';

/** Case-insensitive filename substring filter; an empty query returns every image. */
export function filterImagesByFilename(
  images: readonly AssetMeta[],
  query: string,
): readonly AssetMeta[] {
  const q = query.trim().toLowerCase();
  if (q === '') return images;
  return images.filter((image) => image.filename.toLowerCase().includes(q));
}

/**
 * D-040 — left-side Shared Library panel. The device-level image library
 * (channel logos / persistent bugs) that lives ONCE outside any project. Add an
 * image (file picker → shared store), see the library as thumbnails, click one
 * to make it the canvas logo tool's target, and remove via the context menu.
 * D-068 — a filename search + a persisted grid/list view toggle, at parity with
 * the Project Assets panel (its `GridIcon`/`ListIcon`, styles, and idiom reused).
 *
 * Mirrors {@link ../assets/ProjectAssetsPanel ProjectAssetsPanel} but is
 * project-independent and image-only. Removing a library image does NOT touch
 * scene elements: a still-open project that references it falls back to a
 * placeholder (see the runtime preview), and exports already inlined their bytes.
 */
export function SharedLibraryPanel(): JSX.Element {
  const images = useSharedImages();
  const scene = useDesignerSelector((st) => st.scene);
  const activeId = useActiveSharedImageId();
  // D-067 — pending import count drives the in-grid loading tile(s).
  const { pending: importing, begin } = useImportPending();
  const [ctxMenu, setCtxMenu] = useState<{ image: AssetMeta; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<{ image: AssetMeta; uses: number } | null>(null);
  // D-068 — search + grid/list view, mirroring ProjectAssetsPanel (its own
  // localStorage key so the two panels' view choices are independent).
  const [query, setQuery] = useState('');
  const [libraryView, setLibraryView] = useState<'grid' | 'list'>(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem(SHARED_VIEW_KEY) === 'list'
      ? 'list'
      : 'grid',
  );
  function changeLibraryView(next: 'grid' | 'list'): void {
    setLibraryView(next);
    try {
      localStorage.setItem(SHARED_VIEW_KEY, next);
    } catch {
      /* storage unavailable (private mode) — keep the choice in memory only */
    }
  }
  const visible = useMemo(() => filterImagesByFilename(images, query), [images, query]);

  useEffect(() => {
    if (ctxMenu === null) return;
    function close(): void {
      setCtxMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  async function addImage(): Promise<void> {
    const files = await window.cg.sharedImages.pick();
    if (files.length === 0) return; // cancelled — no tiles shown
    // B-021 — `accept` is a bypassable hint, so validate the SELECTION: reject
    // non-images (pdf/mp3/mp4 from "All files") BEFORE store so they never become a
    // broken tile, and report them in a non-blocking notice. Valid files still import.
    const { valid, rejected } = partitionSupported('image', files);
    if (rejected.length > 0) {
      designerStore.showNotice(skippedFilesMessage(rejected.map((file) => file.name)));
    }
    if (valid.length === 0) return; // every pick was unsupported — only the notice
    // One tile per VALID file; import in reverse selection order so the prepend
    // lands the batch selection-order at the top; each file is independent — a
    // failure clears only its own tile and the rest still import.
    const items = valid.map((file) => ({ file, end: begin() }));
    for (const { file, end } of [...items].reverse()) {
      try {
        await window.cg.sharedImages.store(file);
      } catch {
        /* this file failed — skip it; the others still import */
      } finally {
        end();
      }
    }
  }

  function openDeleteConfirm(image: AssetMeta): void {
    setCtxMenu(null);
    const uses = countLogoUsages(image.assetId, scene?.layers ?? []);
    setConfirm({ image, uses });
  }

  async function runDelete(image: AssetMeta): Promise<void> {
    setConfirm(null);
    // Do NOT cascade into the scene: a logo element that loses its library
    // image must remain and render a placeholder (never vanish silently).
    if (getActiveSharedImage()?.assetId === image.assetId) setActiveSharedImage(null);
    revokeSharedUrl(image.assetId);
    try {
      await window.cg.sharedImages.remove({ assetId: image.assetId });
    } catch {
      /* index already gone — ignore */
    }
    emitSharedImageRemoved(image.assetId);
  }

  return (
    <aside className={ps.panel} aria-label="Shared image library">
      <div className={ps.header}>
        <span className={ps.title}>Shared Library</span>
        <Control
          variant="bare"
          className={ps.iconButton}
          aria-label={libraryView === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          title={libraryView === 'grid' ? 'List view' : 'Grid view'}
          aria-pressed={libraryView === 'list'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => changeLibraryView(libraryView === 'grid' ? 'list' : 'grid')}
        >
          {libraryView === 'grid' ? <ListIcon /> : <GridIcon />}
        </Control>
        <Control
          variant="bare"
          className={ps.iconButton}
          aria-label="Add library image"
          title="Add library image"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={() => void addImage()}
        >
          +
        </Control>
      </div>
      <div className={ps.searchWrap}>
        <input
          className={ps.search}
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search library images"
        />
      </div>
      {visible.length === 0 && importing === 0 ? (
        <div className={ps.emptyWrap} data-role="shared-library-grid">
          <p className={ps.empty}>
            {images.length === 0 ? (
              <>
                No library images yet.
                <br />
                Click + to add a logo or bug used across projects.
              </>
            ) : (
              'No images match your search.'
            )}
          </p>
        </div>
      ) : (
        <div className={libraryView === 'list' ? ps.list : ps.grid} data-role="shared-library-grid">
          {Array.from({ length: importing }, (_, i) => (
            <ImportingThumb key={`importing-${String(i)}`} layout={libraryView} />
          ))}
          {visible.map((image) => (
            <SharedImageThumb
              key={image.assetId}
              image={image}
              layout={libraryView}
              active={image.assetId === activeId}
              onSelect={() => setActiveSharedImage(image)}
              onContextMenu={(x, y) => {
                setCtxMenu({ image, x, y });
              }}
            />
          ))}
        </div>
      )}
      {ctxMenu !== null && (
        <div
          className={ps.menu}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="bare"
            role="menuitem"
            className={cx(ps.menuItem, ps.menuItemDanger)}
            onClick={() => openDeleteConfirm(ctxMenu.image)}
          >
            Remove from library
          </Button>
        </div>
      )}
      {confirm !== null && (
        <DeleteConfirmDialog
          image={confirm.image}
          uses={confirm.uses}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runDelete(confirm.image)}
        />
      )}
    </aside>
  );
}

function SharedImageThumb({
  image,
  layout,
  active,
  onSelect,
  onContextMenu,
}: {
  image: AssetMeta;
  layout: 'grid' | 'list';
  active: boolean;
  onSelect: () => void;
  onContextMenu: (clientX: number, clientY: number) => void;
}): JSX.Element {
  const url = useSharedImageUrl(image.assetId);
  const isList = layout === 'list';
  return (
    <div
      // List rows reuse AssetThumb's row class for the same hover affordance (Project Assets parity).
      className={cx(isList ? ts.cellList : ts.cell, s.clickable, isList && 'cg-asset-row')}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      title={image.filename}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      {/* `thumb` carries the frame (bg/border/overflow/centering); `thumbList` only overrides
          the size — stack both in list mode, exactly like AssetThumb. */}
      <div className={cx(ts.thumb, isList && ts.thumbList, active && s.thumbActive)}>
        {url !== null && (
          <img src={url} alt={image.filename} className={ts.thumbImg} draggable={false} />
        )}
      </div>
      <span className={isList ? ts.captionList : ts.caption}>{stripExt(image.filename)}</span>
      {isList && (
        <>
          <span className={ts.metaType}>{fileExt(image.filename) || 'image'}</span>
          <span className={ts.metaSize}>{formatBytes(image.byteSize)}</span>
        </>
      )}
    </div>
  );
}

function useActiveSharedImageId(): string | null {
  const [id, setId] = useState<string | null>(() => getActiveSharedImage()?.assetId ?? null);
  useEffect(() => subscribeActiveSharedImage((a) => setId(a?.assetId ?? null)), []);
  return id;
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

/** Count logo elements (image elements bound to this library id) in the open scene. */
function countLogoUsages(
  assetId: string,
  layers: readonly { children: readonly Element[] }[],
): number {
  let uses = 0;
  function walk(children: readonly Element[]): void {
    for (const el of children) {
      if (el.type === 'image' && el.source === 'shared' && el.assetId === assetId) uses += 1;
      else if (el.type === 'container') walk(el.children);
    }
  }
  for (const layer of layers) walk(layer.children);
  return uses;
}

function DeleteConfirmDialog({
  image,
  uses,
  onCancel,
  onConfirm,
}: {
  image: AssetMeta;
  uses: number;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const displayName = stripExt(image.filename);
  const message =
    uses === 0
      ? 'This image is not used by the open composition. It will be removed from the shared library; projects that already exported it are unaffected.'
      : `This image is used by ${String(uses)} logo element(s) in the open composition. Removing it from the library leaves those elements in place — they will show a missing-asset placeholder until re-pointed. Projects that already exported it are unaffected.`;
  return (
    <Modal
      title={`Remove “${displayName}” from the library?`}
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel} autoFocus>
            Cancel
          </ModalButton>
          <ModalButton variant="danger" onClick={onConfirm}>
            Remove
          </ModalButton>
        </>
      }
    >
      <div className={ps.modalBody}>{message}</div>
    </Modal>
  );
}
