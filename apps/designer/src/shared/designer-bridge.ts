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
    saveDisk(req: {
      scene: Scene;
      askPath: boolean;
    }): Promise<{ ok: boolean; filename: string | null }>;
    recent(): Promise<ChannelResponse<typeof ProjectsRecentChannel>>;
    starters(): Promise<ChannelResponse<typeof ProjectsStartersChannel>>;
    starter(
      req: ChannelRequest<typeof ProjectsStarterChannel>,
    ): Promise<ChannelResponse<typeof ProjectsStarterChannel>>;
    onActiveChanged(
      handler: (info: { scene: Scene | null; path: string | null }) => void,
    ): Unsubscribe;
  };

  assets: {
    import(
      req: ChannelRequest<typeof AssetsImportChannel>,
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
