// Sandboxed preload bridge for the Designer renderer.
// Compiled to CommonJS — sandboxed preloads can't load ESM in current Electron.
//
// The renderer accesses these APIs via window.cg (see App.tsx).
import { contextBridge, ipcRenderer } from 'electron';

export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

const api = {
  /** Returns basic app metadata. Stub for M0 — real APIs land in M2/M6. */
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
};

contextBridge.exposeInMainWorld('cg', api);

export type DesignerBridge = typeof api;
