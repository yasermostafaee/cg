// Sandboxed preload bridge for the Runtime renderer.
// Compiled to CommonJS — sandboxed preloads can't load ESM in current Electron.
//
// Exposes `window.cg` with typed wrappers around every M5.0 IPC channel
// plus the legacy `getAppInfo`. Each request/response channel becomes a
// promise-returning function; each push channel becomes an `on*(handler)`
// that returns an unsubscribe callback.
//
// Zod validation lives in @cg/shared-ipc's invoke()/subscribe() helpers,
// which run on both ends. A schema mismatch surfaces here, not deep in
// the renderer.
import { contextBridge, ipcRenderer } from 'electron';
import {
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  StackLoadChannel,
  StackOutChannel,
  StackRemoveChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesGetChannel,
  TemplatesListChannel,
  AuditRecentChannel,
  invoke,
  subscribe,
  type ChannelRequest,
  type ChannelResponse,
  type ConnectionConfig,
  type ConnectionHealth,
  type LockState,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';

export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

/** Unsubscribe handle returned by every `on*` subscriber. */
export type Unsubscribe = () => void;

const api = {
  // ── legacy ─────────────────────────────────────────────────────────
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info') as Promise<AppInfo>,

  // ── stack ──────────────────────────────────────────────────────────
  stack: {
    load: (req: ChannelRequest<typeof StackLoadChannel>) =>
      invoke(ipcRenderer, StackLoadChannel, req),
    take: (req: ChannelRequest<typeof StackTakeChannel>) =>
      invoke(ipcRenderer, StackTakeChannel, req),
    update: (req: ChannelRequest<typeof StackUpdateChannel>) =>
      invoke(ipcRenderer, StackUpdateChannel, req),
    out: (req: ChannelRequest<typeof StackOutChannel>) => invoke(ipcRenderer, StackOutChannel, req),
    remove: (req: ChannelRequest<typeof StackRemoveChannel>) =>
      invoke(ipcRenderer, StackRemoveChannel, req),
    snapshot: (): Promise<ChannelResponse<typeof StackSnapshotChannel>> =>
      invoke(ipcRenderer, StackSnapshotChannel, undefined),
    onStateChanged: (handler: (snapshot: readonly StackItemState[]) => void): Unsubscribe =>
      subscribe(ipcRenderer, StackStateChangedChannel, handler),
  },

  // ── connections ────────────────────────────────────────────────────
  connections: {
    config: (): Promise<ConnectionConfig> =>
      invoke(ipcRenderer, ConnectionsConfigChannel, undefined),
    health: (): Promise<ConnectionHealth> =>
      invoke(ipcRenderer, ConnectionsHealthChannel, undefined),
    failover: (req: ChannelRequest<typeof ConnectionsFailoverChannel>) =>
      invoke(ipcRenderer, ConnectionsFailoverChannel, req),
    onHealthChanged: (handler: (health: ConnectionHealth) => void): Unsubscribe =>
      subscribe(ipcRenderer, ConnectionsHealthChangedChannel, handler),
  },

  // ── lock ───────────────────────────────────────────────────────────
  lock: {
    engage: (req: ChannelRequest<typeof LockEngageChannel>) =>
      invoke(ipcRenderer, LockEngageChannel, req),
    release: (req: ChannelRequest<typeof LockReleaseChannel>) =>
      invoke(ipcRenderer, LockReleaseChannel, req),
    state: (): Promise<LockState> => invoke(ipcRenderer, LockStateChannel, undefined),
    onStateChanged: (handler: (state: LockState) => void): Unsubscribe =>
      subscribe(ipcRenderer, LockStateChangedChannel, handler),
  },

  // ── templates ──────────────────────────────────────────────────────
  templates: {
    get: (req: ChannelRequest<typeof TemplatesGetChannel>) =>
      invoke(ipcRenderer, TemplatesGetChannel, req),
    list: () => invoke(ipcRenderer, TemplatesListChannel, undefined),
  },

  // ── audit ──────────────────────────────────────────────────────────
  audit: {
    recent: (req: ChannelRequest<typeof AuditRecentChannel>) =>
      invoke(ipcRenderer, AuditRecentChannel, req),
  },
};

contextBridge.exposeInMainWorld('cg', api);

export type RuntimeBridge = typeof api;
