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
  AssetsStoreBytesChannel,
  SharedImagesImportChannel,
  SharedImagesListChannel,
  SharedImagesRemoveChannel,
  ExportIssue,
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

/**
 * `B-351` — the code of the preflight error for a template too large for CG Control. `Export .vcg`
 * refuses on it; the single-file HTML, which never goes through CG Bridge, does not.
 */
export const CG_CONTROL_TOO_LARGE = 'too-large-for-cg-control';

/**
 * 🔴 `BOOK-EXPORT-01` (`B-349`) — **WHAT BECAME OF THE FILE THE SAVE DIALOG MADE**, after an export
 * that failed. Chrome creates the file, EMPTY, the moment a name is chosen — before a single byte is
 * produced — so a failure used to leave a 0-byte `.vcg` behind, in silence.
 * - `removed` — it was empty and is gone (read back: not found);
 * - `left-empty` — it is still there, empty, and the browser would not remove it;
 * - `unchanged` — it still holds what it held before (never deleted: it is the author's file);
 * - `none` — no file was made (no save dialog, or it failed before choosing).
 */
export type ExportFileFate = 'removed' | 'left-empty' | 'unchanged' | 'none';

/**
 * 🔴 `B-349` — **EVERY EXPORT ENDS IN AN ANSWER**, never in silence:
 * - `written` — the file's name and size;
 * - `cancelled` — the author closed the save dialog;
 * - `blocked` — the template has an error, found BEFORE the save dialog, so no file was made;
 * - `failed` — the export broke: the cause in the author's words, the element at fault when there
 *   is one, and what became of the file.
 */
export type ExportResult =
  | { outcome: 'written'; filename: string; bytes: number }
  | { outcome: 'cancelled' }
  | { outcome: 'blocked'; issues: ExportIssue[] }
  | {
      outcome: 'failed';
      filename: string | null;
      cause: string;
      elementId?: string;
      file: ExportFileFate;
    };

export interface AppInfo {
  name: string;
  version: string;
  /** `process.platform` string — `'win32' | 'darwin' | ...`. */
  platform: string;
}

export type Unsubscribe = () => void;

/** D-150 — which storage root the Designer is using, and why. */
export interface StorageState {
  kind: 'directory' | 'opfs' | 'memory';
  /** Human-meaningful label for the backing store (folder name, `opfs:designer`, `memory`). */
  label: string;
  /**
   * The NAMED reason, not a bare boolean: `folder-permission-lost` and
   * `folder-restore-failed` are different conditions with different remedies, and a
   * single `catch` could not tell them apart — which is how both stayed invisible.
   */
  reason:
    | 'connected-folder'
    | 'opfs'
    | 'folder-permission-lost'
    | 'folder-restore-failed'
    | 'opfs-unavailable'
    | 'forced-memory'
    | 'e2e';
  /** True when this is NOT the root the author configured, or will not survive the tab. */
  degraded: boolean;
  /** True when nothing written to the workspace survives the tab closing. */
  sessionOnly: boolean;
  /** True when a folder can be connected at all (File System Access / Chromium). */
  canConnectFolder: boolean;
  /** The remembered folder's name, when one was remembered — so a notice can name it. */
  folderName?: string;
  /** An error message, when a leg failed with one. Never swallowed. */
  detail?: string;
}

export interface DesignerBridge {
  getAppInfo(): Promise<AppInfo>;

  /**
   * `TEXT-DIGITS-01` — the keyboard language the window types in, from CG Designer's shell (its one
   * read-only command, `keyboard_language`). Where no shell can say — a browser —
   * `reportsLanguage()` is false and the one detector (`@cg/gesture`) reads the letters typed.
   */
  keyboard: {
    reportsLanguage(): boolean;
    /** `persian`, `arabic`, `latin` or `unknown` — the shell's reply, checked by the detector. */
    language(): Promise<unknown>;
  };

  /**
   * 🔴 `D-162` — the window's close, where a shell holds it. A Tauri window runs no
   * `beforeunload` when it is closed, so CG Designer's shell holds every close it can intercept
   * and asks the page instead (`src-tauri/src/close_window.rs`; the JS half is `@cg/gesture`'s
   * `closeGuardDoor`). A browser has no shell: `held()` is false, and the tab's `beforeunload`
   * is the warning.
   */
  closeGuard: {
    /** Is a shell holding this window's closes? */
    held(): boolean;
    /** Every close the shell intercepts calls `onRequest` instead of closing. Returns the release. */
    hold(onRequest: () => void): Unsubscribe;
    /** Close the window now, asking nothing more (nothing to close in a browser). */
    closeNow(): Promise<void>;
  };

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
    saveDisk(req: {
      scene: Scene;
      askPath: boolean;
      /**
       * 🔴 `B-352` — the author's own **Save As**: the file written is a COPY, a project of its own
       * with a NEW project id (so its compositions export as their own templates in CG Control),
       * and it becomes the open project. Absent for a Save, and for a Save that falls back to the
       * dialog (no file yet, or the old file could not be written): those keep the project's id.
       */
      asCopy?: boolean;
    }): Promise<{
      ok: boolean;
      filename: string | null;
      /** D-088 — IndexedDB key of the persisted file handle when saved via a handle. */
      handleKey?: string;
      /** `B-352` — set when an `asCopy` save wrote a copy: the open project's id is this now. */
      projectId?: string;
      /**
       * BOOK-EXPORT Q4 — the write into the file the save dialog made FAILED: the cause in the
       * author's words, and what became of that file (an empty one is removed). Nothing was saved.
       */
      failure?: { cause: string; file: ExportFileFate };
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

  /**
   * D-150 / B-104 — the persistence ROOT, and the one action that can repair it.
   *
   * Workspace initialization used to swallow both of its failure legs in bare
   * `catch {}`s, so an author whose connected folder could not be reopened was moved
   * to a different storage root without a word — and every asset path then resolved
   * somewhere else. That silence is half of B-104. This namespace is how the renderer
   * can say which root is live and why.
   */
  storage: {
    state(): Promise<StorageState>;
    /**
     * Re-grant the connected folder. MUST be called from a user GESTURE — Chromium
     * refuses `requestPermission()` without one, and app startup has none. That is
     * exactly why a lost folder cannot be repaired at boot and has to surface as an
     * action the author takes.
     */
    reconnectFolder(): Promise<{ ok: boolean; label: string }>;
  };

  assets: {
    /**
     * D-067 — open a (multi-select) file picker and return the chosen files (empty
     * if cancelled). Split from the old single-shot `import()` so the caller drives
     * picking: it shows a loading tile per file only after a real selection (a cancel
     * returns `[]`), then `store()`s each file independently.
     *
     * `accept` (`D-164`) is the picker's hint when no `kind` gives one — an image
     * sequence's frames are PNG or TGA, which no asset kind names. A hint only: the
     * caller still validates what comes back.
     */
    pick(kind?: AssetMeta['kind'], opts?: { folder?: boolean; accept?: string }): Promise<File[]>;
    /** D-067 — import one already-picked file (decode / store / dedupe by sha256). */
    store(
      file: File,
      kind?: AssetMeta['kind'],
    ): Promise<ChannelResponse<typeof AssetsImportChannel>>;
    /**
     * D-128 — store already-converted bytes (the canonical WebM the in-app video
     * converter produced) as an asset, with optional source provenance. Same
     * dedupe/index path as `store()` — the raw-bytes sibling for callers that
     * have bytes, not a picked File.
     */
    storeBytes(
      req: ChannelRequest<typeof AssetsStoreBytesChannel>,
    ): Promise<ChannelResponse<typeof AssetsStoreBytesChannel>>;
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
     * Run the export pipeline and write the resulting `.vcg` directly to a file the author picks
     * in the save dialog (a download where the browser has none). `B-349` — never throws: every
     * outcome, a failure included, is an {@link ExportResult}.
     */
    runDisk(req: { scene: Scene }): Promise<ExportResult>;
    /**
     * D-019 — produce a single self-contained, `file://`-safe CasparCG `.html`
     * (scene/CSS/fonts/runtime inlined + an embedded GDD) and download it.
     * `B-349` — never throws: a failure is answered with its cause; a written file carries its
     * non-blocking preflight warnings.
     */
    runSingleFileHtml(req: {
      scene: Scene;
    }): Promise<
      | { outcome: 'written'; filename: string; bytes: number; warnings: string[] }
      | { outcome: 'failed'; cause: string; elementId?: string }
    >;
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
