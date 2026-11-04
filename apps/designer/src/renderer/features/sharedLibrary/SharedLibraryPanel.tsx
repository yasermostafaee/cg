import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Element, Scene } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { ImportingThumb } from '../assets/ImportingThumb.js';
import { useImportPending } from '../assets/useImportPending.js';
import { partitionSupported, skippedFilesMessage } from '../../../shared/asset-types.js';
import { fileExt, formatBytes } from '../assets/AssetThumb.js';
import { emitSharedImageRemoved, useSharedImages, useSharedImageUrl } from './useSharedImages.js';
import { revoke as revokeSharedUrl } from './sharedImageUrlCache.js';
import { revoke as revokeSharedFontUrl } from './sharedFontUrlCache.js';
import { emitSharedFontRemoved, useSharedFonts } from './useSharedFonts.js';
import { unregisterSharedFont } from './sharedFontFaces.js';
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

/** Case-insensitive filename substring filter; an empty query returns every shared asset. */
export function filterImagesByFilename(
  images: readonly AssetMeta[],
  query: string,
): readonly AssetMeta[] {
  const q = query.trim().toLowerCase();
  if (q === '') return images;
  return images.filter((image) => image.filename.toLowerCase().includes(q));
}

/**
 * D-040 / D-126 — the device-level Shared Library that lives once outside any
 * project. Images remain selectable as the canvas logo tool's target; fonts are
 * registered globally and appear in every project's font picker.
 * D-068 — a filename search + a persisted grid/list view toggle, at parity with
 * the Project Assets panel (the shared `Icon`, styles, and idiom reused).
 *
 * Removing an asset never mutates scene elements or prior exports: an unresolved
 * image shows its placeholder and an unresolved font uses the normal fallback.
 */
export function SharedLibraryPanel(): JSX.Element {
  const images = useSharedImages();
  const fonts = useSharedFonts();
  const assets = useMemo(() => [...images, ...fonts], [images, fonts]);
  const scene = useDesignerSelector((st) => st.scene);
  const activeId = useActiveSharedImageId();
  // D-067 — pending import count drives the in-grid loading tile(s).
  const { pending: importing, begin } = useImportPending();
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ asset: AssetMeta; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<{ asset: AssetMeta; uses: number } | null>(null);
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
  const visible = useMemo(() => filterImagesByFilename(assets, query), [assets, query]);

  useEffect(() => {
    if (ctxMenu === null && addMenu === null) return;
    function close(): void {
      setCtxMenu(null);
      setAddMenu(null);
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
  }, [ctxMenu, addMenu]);

  async function addAsset(kind: 'image' | 'font'): Promise<void> {
    setAddMenu(null);
    const files =
      kind === 'image' ? await window.cg.sharedImages.pick() : await window.cg.sharedFonts.pick();
    if (files.length === 0) return; // cancelled — no tiles shown
    // B-021 — `accept` is a bypassable hint, so validate the SELECTION: reject
    // non-images (pdf/mp3/mp4 from "All files") BEFORE store so they never become a
    // broken tile, and report them in a non-blocking notice. Valid files still import.
    const { valid, rejected } = partitionSupported(kind, files);
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
        if (kind === 'image') await window.cg.sharedImages.store(file);
        else await window.cg.sharedFonts.store(file);
      } catch {
        /* this file failed — skip it; the others still import */
      } finally {
        end();
      }
    }
  }

  function openDeleteConfirm(asset: AssetMeta): void {
    setCtxMenu(null);
    const uses = countAssetUsages(asset, scene);
    setConfirm({ asset, uses });
  }

  async function runDelete(asset: AssetMeta): Promise<void> {
    setConfirm(null);
    if (asset.kind === 'font') {
      unregisterSharedFont(asset.assetId);
      revokeSharedFontUrl(asset.assetId);
      await window.cg.sharedFonts.remove({ assetId: asset.assetId }).catch(() => ({ ok: false }));
      emitSharedFontRemoved(asset.assetId);
    } else {
      // Do NOT cascade into the scene: a logo element that loses its library
      // image must remain and render a placeholder (never vanish silently).
      if (getActiveSharedImage()?.assetId === asset.assetId) setActiveSharedImage(null);
      revokeSharedUrl(asset.assetId);
      await window.cg.sharedImages.remove({ assetId: asset.assetId }).catch(() => ({ ok: false }));
      emitSharedImageRemoved(asset.assetId);
    }
  }

  return (
    <aside className={ps.panel} aria-label="Shared asset library">
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
          {libraryView === 'grid' ? (
            <Icon icon={List} size={14} />
          ) : (
            <Icon icon={LayoutGrid} size={14} />
          )}
        </Control>
        <Control
          variant="bare"
          className={ps.iconButton}
          aria-label="Add shared asset"
          title="Add image or font"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setAddMenu({ x: rect?.left ?? 12, y: (rect?.bottom ?? 12) + 4 });
          }}
        >
          <Icon icon={Plus} size={16} />
        </Control>
      </div>
      <div className={ps.searchWrap}>
        <input
          className={ps.search}
          type="search"
          placeholder="Search images and fonts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search shared library"
        />
      </div>
      {visible.length === 0 && importing === 0 ? (
        <div className={ps.emptyWrap} data-role="shared-library-grid">
          <p className={ps.empty}>
            {assets.length === 0 ? (
              <>
                No shared assets yet.
                <br />
                Click + to add an image or font used across projects.
              </>
            ) : (
              'No shared assets match your search.'
            )}
          </p>
        </div>
      ) : (
        <div className={libraryView === 'list' ? ps.list : ps.grid} data-role="shared-library-grid">
          {Array.from({ length: importing }, (_, i) => (
            <ImportingThumb key={`importing-${String(i)}`} layout={libraryView} />
          ))}
          {visible.map((asset) => (
            <SharedAssetThumb
              key={asset.assetId}
              asset={asset}
              layout={libraryView}
              active={asset.kind === 'image' && asset.assetId === activeId}
              onSelect={asset.kind === 'image' ? () => setActiveSharedImage(asset) : undefined}
              onContextMenu={(x, y) => {
                setCtxMenu({ asset, x, y });
              }}
            />
          ))}
        </div>
      )}
      {addMenu !== null && (
        <div
          className={ps.menu}
          style={{ left: addMenu.x, top: addMenu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="bare"
            role="menuitem"
            className={ps.menuItem}
            onClick={() => void addAsset('image')}
          >
            Image…
          </Button>
          <Button
            variant="bare"
            role="menuitem"
            className={ps.menuItem}
            onClick={() => void addAsset('font')}
          >
            Font…
          </Button>
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
            onClick={() => openDeleteConfirm(ctxMenu.asset)}
          >
            Remove from library
          </Button>
        </div>
      )}
      {confirm !== null && (
        <DeleteConfirmDialog
          asset={confirm.asset}
          uses={confirm.uses}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runDelete(confirm.asset)}
        />
      )}
    </aside>
  );
}

function SharedAssetThumb({
  asset,
  layout,
  active,
  onSelect,
  onContextMenu,
}: {
  asset: AssetMeta;
  layout: 'grid' | 'list';
  active: boolean;
  onSelect?: (() => void) | undefined;
  onContextMenu: (clientX: number, clientY: number) => void;
}): JSX.Element {
  const url = useSharedImageUrl(asset.kind === 'image' ? asset.assetId : null);
  const isList = layout === 'list';
  const isFont = asset.kind === 'font';
  return (
    <div
      // List rows reuse AssetThumb's row class for the same hover affordance (Project Assets parity).
      className={cx(
        isList ? ts.cellList : ts.cell,
        onSelect !== undefined && s.clickable,
        isList && 'cg-asset-row',
      )}
      role={onSelect === undefined ? undefined : 'button'}
      tabIndex={onSelect === undefined ? undefined : 0}
      aria-pressed={onSelect === undefined ? undefined : active}
      title={asset.filename}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect !== undefined && (e.key === 'Enter' || e.key === ' ')) {
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
        {asset.kind === 'image' && url !== null && (
          <img src={url} alt={asset.filename} className={ts.thumbImg} draggable={false} />
        )}
        {isFont && (
          <span
            style={{
              fontFamily: `"asset-${asset.assetId}", sans-serif`,
              fontSize: isList ? '0.85rem' : '1.3rem',
            }}
          >
            Abc
          </span>
        )}
      </div>
      <span className={isList ? ts.captionList : ts.caption}>{stripExt(asset.filename)}</span>
      {isList && (
        <>
          <span className={ts.metaType}>{fileExt(asset.filename) || asset.kind}</span>
          <span className={ts.metaSize}>{formatBytes(asset.byteSize)}</span>
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

function countAssetUsages(asset: AssetMeta, scene: Scene | null): number {
  if (scene === null) return 0;
  let uses = 0;
  function walk(children: readonly Element[]): void {
    for (const el of children) {
      if (asset.kind === 'image') {
        if (el.type === 'image' && el.source === 'shared' && el.assetId === asset.assetId)
          uses += 1;
      } else if (
        (el.type === 'text' ||
          el.type === 'ticker' ||
          el.type === 'clock' ||
          el.type === 'sequence') &&
        el.font.family === `asset-${asset.assetId}`
      ) {
        uses += 1;
      }
      if (el.type === 'container') walk(el.children);
    }
  }
  for (const layer of scene.layers) walk(layer.children);
  for (const composition of scene.compositions ?? []) {
    for (const layer of composition.layers) walk(layer.children);
  }
  return uses;
}

function DeleteConfirmDialog({
  asset,
  uses,
  onCancel,
  onConfirm,
}: {
  asset: AssetMeta;
  uses: number;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const displayName = stripExt(asset.filename);
  const noun = asset.kind === 'font' ? 'font' : 'image';
  const message =
    uses === 0
      ? `This ${noun} is not used by the open project. It will be removed from Shared Library; templates already exported with it are unaffected.`
      : asset.kind === 'font'
        ? `This font is used by ${String(uses)} element(s) in the open project. Removing it leaves those references in place and they will use a fallback font until re-pointed. Templates already exported with it are unaffected.`
        : `This image is used by ${String(uses)} logo element(s) in the open project. Removing it leaves those elements in place and they will show a missing-asset placeholder until re-pointed. Templates already exported with it are unaffected.`;
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
