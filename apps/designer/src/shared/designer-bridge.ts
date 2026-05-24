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
  };

  export: {
    preflight(
      req: ChannelRequest<typeof ExportPreflightChannel>,
    ): Promise<ChannelResponse<typeof ExportPreflightChannel>>;
    run(
      req: ChannelRequest<typeof ExportRunChannel>,
    ): Promise<ChannelResponse<typeof ExportRunChannel>>;
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
