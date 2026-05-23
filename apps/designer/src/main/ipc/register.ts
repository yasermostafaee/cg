import {
  AssetsImportChannel,
  AssetsImportedChannel,
  AssetsListChannel,
  AssetsRemoveChannel,
  ExportPreflightChannel,
  ExportProgressChannel,
  ExportRunChannel,
  ProjectsActiveChangedChannel,
  ProjectsNewChannel,
  ProjectsOpenChannel,
  ProjectsRecentChannel,
  ProjectsSaveChannel,
  handle,
  publish,
  type IpcHandler,
  type IpcPublisher,
} from '@cg/shared-ipc';
import type { AssetService } from '../services/AssetService.js';
import type { ExportService } from '../services/ExportService.js';
import type { ProjectService } from '../services/ProjectService.js';

/**
 * Wires every M6.0 Designer IPC channel.
 *
 * Each request channel maps to a service method; the active-project /
 * imported-asset / export-progress streams are re-published as pushes.
 *
 * Returns an `unwire()` callback for tests + clean shutdown.
 */
export interface DesignerIpcWiring {
  ipcMain: IpcHandler;
  webContents: IpcPublisher;
  projects: ProjectService;
  assets: AssetService;
  exporter: ExportService;
  /** Optional: shows an open-file dialog when projects.open arrives without a path. */
  showOpenDialog?: () => Promise<string | null>;
  /** Optional: shows a save-file dialog when projects.save arrives without a path. */
  showSaveDialog?: () => Promise<string | null>;
}

export function registerDesignerIpc(deps: DesignerIpcWiring): () => void {
  const { ipcMain, webContents, projects, assets, exporter, showOpenDialog, showSaveDialog } = deps;

  // ── projects.* ──────────────────────────────────────────────────────
  handle(ipcMain, ProjectsNewChannel, (req) => {
    const { scene, path } = projects.newScene(req.name, req.templateType);
    return { scene, path };
  });

  handle(ipcMain, ProjectsOpenChannel, async (req) => {
    const filePath = req.path ?? (showOpenDialog ? await showOpenDialog() : null);
    if (filePath === null) return { scene: null, path: null };
    const result = await projects.open(filePath);
    return { scene: result.scene, path: result.path };
  });

  handle(ipcMain, ProjectsSaveChannel, async (req) => {
    const filePath = req.path ?? (showSaveDialog ? await showSaveDialog() : null);
    if (filePath === null) throw new Error('save dialog cancelled or unavailable');
    const result = await projects.save(req.scene, filePath);
    return { path: result.path };
  });

  handle(ipcMain, ProjectsRecentChannel, async () => [...(await projects.recent())]);

  // ── assets.* ────────────────────────────────────────────────────────
  handle(ipcMain, AssetsImportChannel, async (req) => {
    const asset = await assets.import(req.sourcePath, req.kind);
    return { asset };
  });

  handle(ipcMain, AssetsListChannel, () => [...assets.list()]);

  handle(ipcMain, AssetsRemoveChannel, (req) => ({ ok: assets.remove(req.assetId) }));

  // ── export.* ────────────────────────────────────────────────────────
  handle(ipcMain, ExportPreflightChannel, (req) => ({
    issues: [...exporter.preflight(req.scene)],
  }));

  handle(ipcMain, ExportRunChannel, async (req) => {
    const result = await exporter.run(req.scene, req.outputPath, req.sign);
    return result;
  });

  // ── pushes ──────────────────────────────────────────────────────────
  const onActive = (info: {
    scene: Parameters<typeof publish<typeof ProjectsActiveChangedChannel>>[2]['scene'];
    path: string | null;
  }): void => {
    publish(webContents, ProjectsActiveChangedChannel, info);
  };
  const onImported = (meta: Parameters<typeof publish<typeof AssetsImportedChannel>>[2]): void => {
    publish(webContents, AssetsImportedChannel, meta);
  };
  const onProgress = (info: Parameters<typeof publish<typeof ExportProgressChannel>>[2]): void => {
    publish(webContents, ExportProgressChannel, info);
  };
  projects.on('active-changed', onActive);
  assets.on('imported', onImported);
  exporter.on('progress', onProgress);

  return () => {
    projects.off('active-changed', onActive);
    assets.off('imported', onImported);
    exporter.off('progress', onProgress);
  };
}
