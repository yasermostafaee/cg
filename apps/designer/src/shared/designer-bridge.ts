/**
 * Shape of `window.cg`, the typed bridge the Designer preload exposes.
 *
 * Lives in `src/shared/` so the preload (node tier) and the renderer
 * (web tier) can both reach it. The runtime implementation is in
 * `src/preload/designer.preload.ts`; this file is the contract.
 */
import type {
  AssetMeta,
  ChannelRequest,
  ChannelResponse,
  AssetsImportChannel,
  AssetsListChannel,
  AssetsRemoveChannel,
  SharedImagesImportChannel,
  SharedImagesListChannel,
  SharedImagesRemoveChannel,
  ExportPreflightChannel,
  ExportProgress,
  ExportRunChannel,
  PreviewLoadChannel,
  PreviewReloadChannel,
  PreviewUpdateChannel,
  ProjectsNewChannel,
  ProjectsOpenChannel,
  ProjectsRecentChannel,
  ProjectsSaveChannel,
  ProjectsStarterChannel,
  ProjectsStartersChannel,
} from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';

export interface AppInfo {
  name: string;
  version: string;
  /** `process.platform` string — `'win32' | 'darwin' | ...`. */
  platform: string;
}

export type Unsubscribe = () => void;

export interface DesignerBridge {
  getAppInfo(): Promise<AppInfo>;

  projects: {
    create(
      req: ChannelRequest<typeof ProjectsNewChannel>,
    ): Promise<ChannelResponse<typeof ProjectsNewChannel>>;
    open(
      req: ChannelRequest<typeof ProjectsOpenChannel>,
    ): Promise<ChannelResponse<typeof ProjectsOpenChannel>>;
    save(
      req: ChannelRequest<typeof ProjectsSaveChannel>,
    ): Promise<ChannelResponse<typeof ProjectsSaveChannel>>;
    /**
     * Save the scene to a real file on the operator's disk. When
     * `askPath` is true (Save As), always opens the native save
     * dialog. When false (Save), reuses the file handle picked the
     * last time this scene was saved — falling back to the dialog
     * if there's no remembered handle. Returns the picked file's
     * name (no path — browsers don't expose the absolute disk path).
     * Returns `{ ok: false }` when the operator cancels the dialog.
     */
    saveDisk(req: { scene: Scene; askPath: boolean }): Promise<{
      ok: boolean;
      filename: string | null;
      /** D-088 — IndexedDB key of the persisted file handle when saved via a handle. */
      handleKey?: string;
      /**
       * D-088 — set when the write to the cached handle THREW (permission revoked, disk
       * error, invalid handle): the caller should notice "Couldn't write to the file —
       * choose where to save." and retry as Save As. (A merely deleted file does not throw
       * — the browser recreates it at the same handle location.)
       */
      reason?: 'write-failed';
    }>;
    /**
     * D-088 — open a project through `showOpenFilePicker` so the opened file carries a
     * writable handle (a later Save writes back to it). Falls back to a hidden input (a
     * `File`, no handle) when File System Access is unavailable. `scene` is null on cancel.
     */
    openDisk(): Promise<{ scene: Scene | null; handleKey: string | null }>;
    /**
     * D-088 — reopen a Recent entry. A handle entry re-acquires write permission in the
     * click and opens; a legacy `path` entry opens via the OPFS path-model. When the handle
     * is denied / stale / its file is gone, returns `needsPicker: true` so the caller falls
     * back to `openDisk()` with a notice.
     */
    openRecent(req: { projectId?: string; handleKey?: string; path?: string }): Promise<{
      scene: Scene | null;
      handleKey: string | null;
      needsPicker: boolean;
    }>;
    recent(): Promise<ChannelResponse<typeof ProjectsRecentChannel>>;
    /**
     * D-093 — remove one Recent entry. NON-DESTRUCTIVE: drops the list entry and, for a
     * handle-backed entry, forgets the persisted handle + permission (`forgetFileHandle`).
     * Never deletes/modifies the underlying file. Matched by `projectId` (legacy by `path`).
     */
    forgetRecent(req: { projectId?: string; handleKey?: string; path?: string }): Promise<void>;
    /** D-093 — empty Recent and forget every cached handle. Same non-destructive rules. */
    clearRecent(): Promise<void>;
    starters(): Promise<ChannelResponse<typeof ProjectsStartersChannel>>;
    starter(
      req: ChannelRequest<typeof ProjectsStarterChannel>,
    ): Promise<ChannelResponse<typeof ProjectsStarterChannel>>;
    onActiveChanged(
      handler: (info: { scene: Scene | null; path: string | null }) => void,
    ): Unsubscribe;
  };

  assets: {
    /**
     * D-067 — open a (multi-select) file picker and return the chosen files (empty
     * if cancelled). Split from the old single-shot `import()` so the caller drives
     * picking: it shows a loading tile per file only after a real selection (a cancel
     * returns `[]`), then `store()`s each file independently.
     */
    pick(kind?: AssetMeta['kind']): Promise<File[]>;
    /** D-067 — import one already-picked file (decode / store / dedupe by sha256). */
    store(
      file: File,
      kind?: AssetMeta['kind'],
    ): Promise<ChannelResponse<typeof AssetsImportChannel>>;
    list(): Promise<ChannelResponse<typeof AssetsListChannel>>;
    remove(
      req: ChannelRequest<typeof AssetsRemoveChannel>,
    ): Promise<ChannelResponse<typeof AssetsRemoveChannel>>;
    onImported(handler: (asset: AssetMeta) => void): Unsubscribe;
    /**
     * Fires when the active project changes — the previous project's
     * assets are no longer accessible and renderer-side caches (blob
     * URLs, registered font faces) should be dropped. Subscribers
     * typically re-call `list()` to populate the new project's assets.
     */
    onCleared(handler: () => void): Unsubscribe;
    /** D-011 — resolve an assetId to a cached blob URL for previews. */
    url(assetId: string): Promise<string | null>;
  };

  /**
   * D-040 — the device-level shared image library, project-independent and
   * image-only. Mirrors `assets` (import / list / remove / onImported / url) but
   * persists across project switches; there is no `onCleared` (the library
   * outlives any one project).
   */
  sharedImages: {
    /**
     * D-067 — open a (multi-select) image picker; returns the chosen files (empty
     * if cancelled). The caller shows a tile per file then `store()`s each.
     */
    pick(): Promise<File[]>;
    /** D-067 — import one already-picked image into the shared library. */
    store(file: File): Promise<ChannelResponse<typeof SharedImagesImportChannel>>;
    list(): Promise<ChannelResponse<typeof SharedImagesListChannel>>;
    remove(
      req: ChannelRequest<typeof SharedImagesRemoveChannel>,
    ): Promise<ChannelResponse<typeof SharedImagesRemoveChannel>>;
    onImported(handler: (image: AssetMeta) => void): Unsubscribe;
    /** D-040 — resolve a shared-library imageId to a cached blob URL for previews. */
    url(assetId: string): Promise<string | null>;
  };

  export: {
    preflight(
      req: ChannelRequest<typeof ExportPreflightChannel>,
    ): Promise<ChannelResponse<typeof ExportPreflightChannel>>;
    run(
      req: ChannelRequest<typeof ExportRunChannel>,
    ): Promise<ChannelResponse<typeof ExportRunChannel>>;
    /**
     * Run the export pipeline and write the resulting `.vcg` directly
     * to a file the operator picks via the native save dialog (Windows
     * Explorer / macOS Finder). Returns `{ ok: false }` when the
     * operator cancels.
     */
    runDisk(req: { scene: Scene }): Promise<{ ok: boolean; filename: string | null }>;
    /**
     * D-019 — produce a single self-contained, `file://`-safe CasparCG `.html`
     * (scene/CSS/fonts/runtime inlined + an embedded GDD) and download it.
     * Returns the filename, byte size, and any non-blocking preflight warnings.
     */
    runSingleFileHtml(req: {
      scene: Scene;
    }): Promise<{ filename: string; bytes: number; warnings: string[] }>;
    onProgress(handler: (progress: ExportProgress) => void): Unsubscribe;
  };

  preview: {
    load(
      req: ChannelRequest<typeof PreviewLoadChannel>,
    ): Promise<ChannelResponse<typeof PreviewLoadChannel>>;
    update(
      req: ChannelRequest<typeof PreviewUpdateChannel>,
    ): Promise<ChannelResponse<typeof PreviewUpdateChannel>>;
    reload(): Promise<ChannelResponse<typeof PreviewReloadChannel>>;
  };
}
