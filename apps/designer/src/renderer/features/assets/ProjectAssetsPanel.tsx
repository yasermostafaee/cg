import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Element } from '@cg/shared-schema';
import { importLottie } from '@cg/lottie-bridge';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { AssetThumb } from './AssetThumb.js';
import { ImportingThumb } from './ImportingThumb.js';
import { useImportPending } from './useImportPending.js';
import { partitionSupported, skippedFilesMessage } from '../../../shared/asset-types.js';
import { emitAssetRemoved, useAssets } from './useAssets.js';
import { clearAll as clearAllAssetUrls, revoke as revokeAssetUrl } from './assetUrlCache.js';
import { clearAll as clearAllLottieAssets } from './lottieAssetCache.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { VideoImportModal } from './VideoImportModal.js';
import { defaultVideo } from '../../state/element-defaults.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './ProjectAssetsPanel.css.js';

/**
 * Module-level FontFace registry. The assets panel registers a
 * `@font-face` for every imported font asset and keeps the handle so
 * the right-click delete flow can `document.fonts.delete(face)` without
 * a page reload.
 */
const fontFaces = new Map<string, FontFace>();

/** Persisted grid/list preference for the assets panel. */
const ASSET_VIEW_KEY = 'cg.designer.assetsView';

/**
 * D-011 — left-side Project Assets panel. Title + add menu (image / font)
 * on top, a search box, and a grid of asset thumbnails below. Image
 * thumbnails are draggable onto the canvas; font assets register a CSS
 * `@font-face` and surface in the Text inspector's font dropdown.
 *
 * Right-clicking a thumbnail opens a small context menu with a Delete
 * action that warns about in-scene usages before removing the asset.
 */
export function ProjectAssetsPanel(): JSX.Element {
  const assets = useAssets();
  const scene = useDesignerSelector((s) => s.scene);
  // D-067 — pending import count drives the in-grid loading tile(s).
  const { pending: importing, begin } = useImportPending();
  const [query, setQuery] = useState('');
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ asset: AssetMeta; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<{
    asset: AssetMeta;
    fontUses: number;
    imageUses: number;
    lottieUses: number;
    videoUses: number;
  } | null>(null);
  // D-128 — a picked video file awaiting the crop/convert modal.
  const [videoImport, setVideoImport] = useState<File | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const [assetView, setAssetView] = useState<'grid' | 'list'>(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem(ASSET_VIEW_KEY) === 'list'
      ? 'list'
      : 'grid',
  );
  function changeAssetView(next: 'grid' | 'list'): void {
    setAssetView(next);
    try {
      localStorage.setItem(ASSET_VIEW_KEY, next);
    } catch {
      /* storage unavailable (private mode) — keep the choice in memory only */
    }
  }

  // Register `@font-face` for every imported font so the thumbnail
  // sample text — and the iframe preview, and the Text inspector — can
  // render them. The renderer document is the source of truth; the
  // iframe inherits styles via a separate registration in the runtime.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const asset of assets) {
        if (asset.kind !== 'font' || fontFaces.has(asset.assetId)) continue;
        const url = await window.cg.assets.url(asset.assetId);
        if (cancelled || url === null) continue;
        try {
          // Fetch the bytes ourselves and feed an ArrayBuffer to
          // FontFace. Going through `url(blob:…)` triggered the
          // Chromium "Slow network is detected. Fallback font will be
          // used while loading" intervention even for trivially local
          // blob URLs — the operator briefly saw the wrong font on
          // every project open. ArrayBuffer skips the network heuristic
          // entirely.
          const buffer = await (await fetch(url)).arrayBuffer();
          if (cancelled) continue;
          const family = `asset-${asset.assetId}`;
          const face = new FontFace(family, buffer);
          await face.load();
          if (cancelled) continue;
          (document as Document & { fonts: FontFaceSet }).fonts.add(face);
          fontFaces.set(asset.assetId, face);
          // Persist the font in `scene.fonts` so the Text inspector
          // dropdown lists it.
          designerStore.addSceneFont({
            family,
            displayName: stripExt(asset.filename),
            assetId: asset.assetId,
          });
        } catch {
          /* failed to load — silently skip; future PRD covers errors */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assets]);

  // Project switch — drop the previous project's font faces from
  // `document.fonts` and clear the renderer-side blob URL cache so the
  // canvas / iframe don't accidentally paint stale images. The next
  // `assets` change (driven by the new project's list) will register
  // fresh faces and re-prime URLs.
  useEffect(() => {
    const off = window.cg.assets.onCleared(() => {
      const docFonts = (document as Document & { fonts: FontFaceSet }).fonts;
      for (const face of fontFaces.values()) docFonts.delete(face);
      fontFaces.clear();
      clearAllAssetUrls();
      clearAllLottieAssets();
    });
    return off;
  }, []);

  useEffect(() => {
    if (addMenu === null && ctxMenu === null) return;
    function close(): void {
      setAddMenu(null);
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
  }, [addMenu, ctxMenu]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return assets;
    return assets.filter((a) => a.filename.toLowerCase().includes(q));
  }, [assets, query]);

  async function importKind(kind: 'image' | 'font' | 'lottie'): Promise<void> {
    setAddMenu(null);
    const files = await window.cg.assets.pick(kind);
    if (files.length === 0) return; // cancelled — no tiles shown
    // B-021 — `accept` is a bypassable hint, so validate the SELECTION against the
    // chosen kind: reject the wrong type (e.g. a pdf/mp3 picked into Image…, or a
    // non-font into Font…) BEFORE store so it never becomes a broken tile, and report
    // it in a non-blocking notice. Valid files of the chosen kind still import.
    const { valid, rejected } = partitionSupported(kind, files);
    if (rejected.length > 0) {
      designerStore.showNotice(skippedFilesMessage(rejected.map((file) => file.name)));
    }
    if (valid.length === 0) return; // every pick was unsupported — only the notice
    // D-125 — a Lottie must additionally pass the allowlist validator BEFORE it
    // becomes an asset (3D / expressions / effects / audio are rejected, and
    // malformed JSON is skipped with a notice). Image/font take no extra step.
    const toStore = kind === 'lottie' ? await validateLottieFiles(valid) : valid;
    if (toStore.length === 0) return;
    // One loading tile per file we will store (shown only after a real selection).
    // Import in REVERSE selection order so the prepend (newest on top) lands the batch
    // in selection order; each file is independent — a failure clears only its own tile
    // and the rest still import.
    const items = toStore.map((file) => ({ file, end: begin() }));
    for (const { file, end } of [...items].reverse()) {
      try {
        await window.cg.assets.store(file, kind);
      } catch {
        /* this file failed — skip it; the others still import */
      } finally {
        end();
      }
    }
  }

  /**
   * D-128 — video import: pick → the crop/convert modal (VideoImportModal) →
   * `storeBytes` of the converted WebM. One clip at a time — the modal is a
   * per-clip surface (crop + progress), unlike the batch image/font path. Video
   * is a per-PROJECT asset ONLY, never a device-level library entry (the
   * converted WebM is conformed to THIS project's frame rate, so it is not
   * portable the way a library resource must be).
   */
  async function importVideo(): Promise<void> {
    setAddMenu(null);
    const files = await window.cg.assets.pick('video');
    if (files.length === 0) return; // cancelled
    const { valid, rejected } = partitionSupported('video', files);
    if (rejected.length > 0) {
      designerStore.showNotice(skippedFilesMessage(rejected.map((file) => file.name)));
    }
    const first = valid[0];
    if (first === undefined) return;
    if (valid.length > 1) {
      designerStore.showNotice('Video clips import one at a time — taking the first selection.');
    }
    setVideoImport(first);
  }

  /**
   * D-125 — validate each picked `.json` through the lottie-bridge allowlist before
   * it is stored. A file that isn't valid JSON, or whose animation uses an
   * unsupported feature (3D / expressions / effects / audio), is skipped with a
   * readable notice built from the first rejection; only passing files are returned.
   */
  async function validateLottieFiles(files: readonly File[]): Promise<File[]> {
    const ok: File[] = [];
    for (const file of files) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        designerStore.showNotice(`“${file.name}” is not valid JSON — skipped.`);
        continue;
      }
      const result = importLottie(parsed);
      if (!result.ok) {
        const reason = result.rejected[0]?.message ?? 'unsupported Lottie features';
        designerStore.showNotice(`“${file.name}” can’t be imported: ${reason}`);
        continue;
      }
      ok.push(file);
    }
    return ok;
  }

  function openContextMenu(asset: AssetMeta, x: number, y: number): void {
    setAddMenu(null);
    setCtxMenu({ asset, x, y });
  }

  function openDeleteConfirm(asset: AssetMeta): void {
    setCtxMenu(null);
    const { fontUses, imageUses, lottieUses, videoUses } = countUsages(asset, scene?.layers ?? []);
    setConfirm({ asset, fontUses, imageUses, lottieUses, videoUses });
  }

  async function runDelete(asset: AssetMeta): Promise<void> {
    setConfirm(null);
    // 1. Cascade through the scene first so the canvas / timeline /
    //    inspector all stop referencing the asset on the same render.
    designerStore.removeAssetFromScene(asset.assetId);
    // 2. Unregister the @font-face (no-op for image assets).
    const face = fontFaces.get(asset.assetId);
    if (face !== undefined) {
      (document as Document & { fonts: FontFaceSet }).fonts.delete(face);
      fontFaces.delete(asset.assetId);
    }
    // 3. Drop the cached blob URL so the bytes can be released.
    revokeAssetUrl(asset.assetId);
    // 4. Persist the removal in the workspace.
    try {
      await window.cg.assets.remove({ assetId: asset.assetId });
    } catch {
      /* index already gone — ignore */
    }
    // 5. Tell live `useAssets` subscribers (the panel itself) to drop
    //    the row.
    emitAssetRemoved(asset.assetId);
  }

  return (
    <aside className={s.panel} aria-label="Project assets">
      <div className={s.header}>
        <span className={s.title}>Project Assets</span>
        <Control
          variant="bare"
          className={s.iconButton}
          aria-label={assetView === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          title={assetView === 'grid' ? 'List view' : 'Grid view'}
          aria-pressed={assetView === 'list'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => changeAssetView(assetView === 'grid' ? 'list' : 'grid')}
        >
          {assetView === 'grid' ? (
            <Icon icon={List} size={14} />
          ) : (
            <Icon icon={LayoutGrid} size={14} />
          )}
        </Control>
        <Control
          ref={addBtnRef}
          variant="bare"
          className={s.iconButton}
          aria-label="Add asset"
          title="Add asset"
          onPointerDown={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setAddMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <Icon icon={Plus} size={16} />
        </Control>
      </div>
      <div className={s.searchWrap}>
        <input
          className={s.search}
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search assets"
        />
      </div>
      {visible.length === 0 && importing === 0 ? (
        <div className={s.emptyWrap} data-role="assets-grid">
          <p className={s.empty}>
            No assets yet.
            <br />
            Click + to add an image or font.
          </p>
        </div>
      ) : (
        <div className={assetView === 'list' ? s.list : s.grid} data-role="assets-grid">
          {Array.from({ length: importing }, (_, i) => (
            <ImportingThumb key={`importing-${String(i)}`} layout={assetView} />
          ))}
          {visible.map((a) => (
            <AssetThumb
              key={a.assetId}
              asset={a}
              layout={assetView}
              onContextMenu={openContextMenu}
            />
          ))}
        </div>
      )}
      {addMenu !== null && (
        <div
          className={s.menu}
          style={{ left: addMenu.x, top: addMenu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="bare"
            role="menuitem"
            className={s.menuItem}
            onClick={() => void importKind('image')}
          >
            Image…
          </Button>
          <Button
            variant="bare"
            role="menuitem"
            className={s.menuItem}
            onClick={() => void importKind('font')}
          >
            Font…
          </Button>
          <Button
            variant="bare"
            role="menuitem"
            className={s.menuItem}
            onClick={() => void importKind('lottie')}
          >
            Lottie…
          </Button>
          <Button
            variant="bare"
            role="menuitem"
            className={s.menuItem}
            onClick={() => void importVideo()}
          >
            Video…
          </Button>
        </div>
      )}
      {videoImport !== null && (
        <VideoImportModal
          file={videoImport}
          onClose={() => setVideoImport(null)}
          onDone={(result) => {
            setVideoImport(null);
            placeVideoElement(result, scene);
          }}
        />
      )}
      {ctxMenu !== null && (
        <div
          className={s.menu}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="bare"
            role="menuitem"
            className={cx(s.menuItem, s.menuItemDanger)}
            onClick={() => openDeleteConfirm(ctxMenu.asset)}
          >
            Delete asset
          </Button>
        </div>
      )}
      {confirm !== null && (
        <DeleteConfirmDialog
          asset={confirm.asset}
          fontUses={confirm.fontUses}
          imageUses={confirm.imageUses}
          lottieUses={confirm.lottieUses}
          videoUses={confirm.videoUses}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runDelete(confirm.asset)}
        />
      )}
    </aside>
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

/**
 * Count how many in-scene elements reference the asset. For a font
 * asset we count text elements whose `font.family` matches the
 * `asset-<assetId>` family that the panel registered; for an image
 * asset we count `<image>` elements bound to the assetId. Containers
 * are recursed.
 */
function countUsages(
  asset: AssetMeta,
  layers: readonly { children: readonly Element[] }[],
): { fontUses: number; imageUses: number; lottieUses: number; videoUses: number } {
  let fontUses = 0;
  let imageUses = 0;
  let lottieUses = 0;
  let videoUses = 0;
  const family = `asset-${asset.assetId}`;

  function walk(children: readonly Element[]): void {
    for (const el of children) {
      if (el.type === 'text' && el.font.family === family) fontUses += 1;
      else if (el.type === 'image' && el.assetId === asset.assetId) imageUses += 1;
      else if (el.type === 'lottie' && el.assetId === asset.assetId) lottieUses += 1;
      else if (el.type === 'video' && el.assetId === asset.assetId) videoUses += 1;
      else if (el.type === 'container') walk(el.children);
    }
  }
  for (const layer of layers) walk(layer.children);
  return { fontUses, imageUses, lottieUses, videoUses };
}

/**
 * D-128 — place a freshly-imported clip as a `video` element at the scene
 * centre, sized to the stored clip (post-crop), scaled down to fit when larger
 * than the frame. The drag-from-assets drop is the other entry point to the
 * same element (CanvasOverlay).
 */
function placeVideoElement(
  result: { asset: AssetMeta; durationMs: number; width: number; height: number },
  scene: { resolution: { width: number; height: number } } | null,
): void {
  const res = scene?.resolution ?? { width: 1920, height: 1080 };
  const fit = Math.min(res.width / result.width, res.height / result.height, 1);
  const id = `el-${String(Date.now())}`;
  designerStore.addElement(
    defaultVideo(id, res.width / 2, res.height / 2, result.asset.assetId, result.durationMs, {
      width: Math.round(result.width * fit),
      height: Math.round(result.height * fit),
    }),
  );
  designerStore.setSelection([id]);
}

function DeleteConfirmDialog({
  asset,
  fontUses,
  imageUses,
  lottieUses,
  videoUses,
  onCancel,
  onConfirm,
}: {
  asset: AssetMeta;
  fontUses: number;
  imageUses: number;
  lottieUses: number;
  videoUses: number;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const displayName = stripExt(asset.filename);
  const message = buildWarningMessage(asset, fontUses, imageUses, lottieUses, videoUses);
  return (
    <Modal
      title={`Delete “${displayName}”?`}
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel} autoFocus>
            Cancel
          </ModalButton>
          <ModalButton variant="danger" onClick={onConfirm}>
            Delete
          </ModalButton>
        </>
      }
    >
      <div className={s.modalBody}>{message}</div>
    </Modal>
  );
}

function buildWarningMessage(
  asset: AssetMeta,
  fontUses: number,
  imageUses: number,
  lottieUses: number,
  videoUses: number,
): string {
  if (asset.kind === 'font') {
    if (fontUses === 0) {
      return 'This font is not used anywhere in the scene. It will be removed from the project assets and the Text inspector’s font list.';
    }
    const noun = fontUses === 1 ? 'text element' : 'text elements';
    return `This font is used by ${String(fontUses)} ${noun}. Deleting it will revert those text elements to the default font (Inter).`;
  }
  if (asset.kind === 'image') {
    if (imageUses === 0) {
      return 'This image is not used anywhere in the scene. It will be removed from the project assets.';
    }
    const noun = imageUses === 1 ? 'image element' : 'image elements';
    return `This image is used by ${String(imageUses)} ${noun}. Deleting it will remove ${imageUses === 1 ? 'that element' : 'those elements'} from the canvas and the timeline.`;
  }
  if (asset.kind === 'lottie') {
    if (lottieUses === 0) {
      return 'This animation is not used anywhere in the scene. It will be removed from the project assets.';
    }
    const noun = lottieUses === 1 ? 'Lottie element' : 'Lottie elements';
    return `This animation is used by ${String(lottieUses)} ${noun}. Deleting it will remove ${lottieUses === 1 ? 'that element' : 'those elements'} from the canvas and the timeline.`;
  }
  if (asset.kind === 'video') {
    if (videoUses === 0) {
      return 'This clip is not used anywhere in the scene. It will be removed from the project assets.';
    }
    const noun = videoUses === 1 ? 'video element' : 'video elements';
    return `This clip is used by ${String(videoUses)} ${noun}. Deleting it will remove ${videoUses === 1 ? 'that element' : 'those elements'} from the canvas and the timeline.`;
  }
  return 'This asset will be removed from the project. Any references in the scene will be cleared.';
}
