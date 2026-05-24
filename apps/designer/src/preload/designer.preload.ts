// Sandboxed preload bridge for the Designer renderer.
// Compiled to CommonJS — sandboxed preloads can't load ESM in current Electron.
//
// Exposes `window.cg` with typed wrappers around every M6.0 IPC channel.
// Zod validation runs inside `invoke()` / `subscribe()` from @cg/shared-ipc.
import { contextBridge, ipcRenderer } from 'electron';
import {
  AssetsImportChannel,
  AssetsImportedChannel,
  AssetsListChannel,
  AssetsRemoveChannel,
  ExportPreflightChannel,
  ExportProgressChannel,
  ExportRunChannel,
  PreviewLoadChannel,
  PreviewReloadChannel,
  PreviewUpdateChannel,
  ProjectsActiveChangedChannel,
  ProjectsNewChannel,
  ProjectsOpenChannel,
  ProjectsRecentChannel,
  ProjectsSaveChannel,
  ProjectsStarterChannel,
  ProjectsStartersChannel,
  invoke,
  subscribe,
  type ChannelRequest,
} from '@cg/shared-ipc';

export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

export type Unsubscribe = () => void;

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info') as Promise<AppInfo>,

  // ── projects ────────────────────────────────────────────────────────
  projects: {
    create: (req: ChannelRequest<typeof ProjectsNewChannel>) =>
      invoke(ipcRenderer, ProjectsNewChannel, req),
    open: (req: ChannelRequest<typeof ProjectsOpenChannel>) =>
      invoke(ipcRenderer, ProjectsOpenChannel, req),
    save: (req: ChannelRequest<typeof ProjectsSaveChannel>) =>
      invoke(ipcRenderer, ProjectsSaveChannel, req),
    recent: () => invoke(ipcRenderer, ProjectsRecentChannel, undefined),
    starters: () => invoke(ipcRenderer, ProjectsStartersChannel, undefined),
    starter: (req: ChannelRequest<typeof ProjectsStarterChannel>) =>
      invoke(ipcRenderer, ProjectsStarterChannel, req),
    onActiveChanged: (
      handler: (info: { scene: unknown; path: string | null }) => void,
    ): Unsubscribe =>
      subscribe(ipcRenderer, ProjectsActiveChangedChannel, handler as (p: unknown) => void),
  },

  // ── assets ──────────────────────────────────────────────────────────
  assets: {
    import: (req: ChannelRequest<typeof AssetsImportChannel>) =>
      invoke(ipcRenderer, AssetsImportChannel, req),
    list: () => invoke(ipcRenderer, AssetsListChannel, undefined),
    remove: (req: ChannelRequest<typeof AssetsRemoveChannel>) =>
      invoke(ipcRenderer, AssetsRemoveChannel, req),
    onImported: (handler: (asset: unknown) => void): Unsubscribe =>
      subscribe(ipcRenderer, AssetsImportedChannel, handler),
  },

  // ── export ──────────────────────────────────────────────────────────
  export: {
    preflight: (req: ChannelRequest<typeof ExportPreflightChannel>) =>
      invoke(ipcRenderer, ExportPreflightChannel, req),
    run: (req: ChannelRequest<typeof ExportRunChannel>) =>
      invoke(ipcRenderer, ExportRunChannel, req),
    onProgress: (handler: (progress: unknown) => void): Unsubscribe =>
      subscribe(ipcRenderer, ExportProgressChannel, handler),
  },

  // ── preview ─────────────────────────────────────────────────────────
  preview: {
    load: (req: ChannelRequest<typeof PreviewLoadChannel>) =>
      invoke(ipcRenderer, PreviewLoadChannel, req),
    update: (req: ChannelRequest<typeof PreviewUpdateChannel>) =>
      invoke(ipcRenderer, PreviewUpdateChannel, req),
    reload: () => invoke(ipcRenderer, PreviewReloadChannel, undefined),
  },
};

contextBridge.exposeInMainWorld('cg', api);

export type DesignerBridge = typeof api;
