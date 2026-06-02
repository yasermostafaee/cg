import { SceneSchema, type Scene } from '@cg/shared-schema';
import type { AppInfo, DesignerBridge } from '../shared/designer-bridge.js';
import { cgCss, cgJs } from './cg-runtime.js';
import { initWorkspace, prefs } from './workspace.js';
import { ProjectStore } from './ProjectStore.js';
import { AssetStore } from './AssetStore.js';
import { Exporter } from './Exporter.js';
import { Preview } from './preview.js';

const APP_INFO: AppInfo = { name: 'cg Designer', version: '0.0.0', platform: 'browser' };

/**
 * Build the browser `DesignerBridge` — the in-process replacement for the
 * Electron preload's `window.cg`. The renderer is unchanged; only the
 * implementation behind the contract differs (browser storage + Blob URLs
 * instead of Electron IPC + a custom protocol).
 */
export async function initDesignerPlatform(): Promise<DesignerBridge> {
  const ws = await initWorkspace();
  const projects = new ProjectStore(ws, prefs);
  const assets = new AssetStore(ws);
  const exporter = new Exporter({ assets, cgJs, cgCss });
  const preview = new Preview({ cgJs, cgCss });
  const assetUrlCache = new Map<string, string>();
  // Per-scene cache of the native file handle picked the last time the
  // operator hit Save / Save As (for .cg.json) or Export (for .vcg).
  // Lets subsequent Save calls write to the same file silently, without
  // re-prompting via the file dialog. Handles do not persist across
  // page reloads.
  const sceneSaveHandles = new Map<string, FileSystemFileHandle>();
  const exportHandles = new Map<string, FileSystemFileHandle>();

  // Keep the asset store pointed at the active project at all times.
  // The renderer never juggles project IDs explicitly — switching
  // projects via `projects.open`/`projects.create`/starter triggers
  // `activeChanged`, which we relay into `assets.setActiveProject`.
  // Any cached blob URLs from the previous project are revoked so the
  // browser releases the bytes.
  projects.activeChanged.subscribe(({ scene }) => {
    assets.setActiveProject(scene?.id ?? null);
    for (const url of assetUrlCache.values()) URL.revokeObjectURL(url);
    assetUrlCache.clear();
  });

  return {
    getAppInfo: () => Promise.resolve(APP_INFO),

    projects: {
      create: (req) =>
        Promise.resolve(
          projects.newScene(req.name, req.templateType, {
            ...(req.resolution !== undefined ? { resolution: req.resolution } : {}),
            ...(req.frameRate !== undefined ? { frameRate: req.frameRate } : {}),
          }),
        ),
      open: async (req) => {
        if (req.path !== undefined) return projects.open(req.path);
        const picked = await pickJsonFile();
        if (picked === null) return { scene: null, path: null };
        const scene = SceneSchema.parse(JSON.parse(picked.text));
        const { path } = await projects.save(scene, picked.name);
        return { scene, path };
      },
      save: (req) => projects.save(req.scene, req.path ?? req.scene.name),
      saveDisk: async (req) => {
        const { scene, askPath } = req;
        let handle = askPath ? null : (sceneSaveHandles.get(scene.id) ?? null);
        if (handle === null) {
          const sfp = window.showSaveFilePicker;
          if (sfp === undefined) {
            // Fallback for browsers without File System Access (Firefox).
            // Trigger the browser's "save" download mechanism instead.
            const filename = `${slugifyName(scene.name) || 'untitled'}.cg.json`;
            triggerJsonDownload(scene, filename);
            return { ok: true, filename };
          }
          try {
            handle = await sfp({
              suggestedName: `${slugifyName(scene.name) || 'untitled'}.cg.json`,
              types: [
                {
                  description: 'cg Designer scene',
                  accept: { 'application/json': ['.json', '.cg.json'] },
                },
              ],
            });
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return { ok: false, filename: null };
            }
            throw err;
          }
          sceneSaveHandles.set(scene.id, handle);
        }
        const writable = await handle.createWritable();
        await writable.write(
          new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }),
        );
        await writable.close();
        return { ok: true, filename: handle.name };
      },
      recent: () => Promise.resolve(projects.recent()),
      starters: () => Promise.resolve(projects.starters()),
      starter: (req) => {
        const result = projects.loadStarter(req.starterId);
        if (result === null) return Promise.reject(new Error(`Unknown starter: ${req.starterId}`));
        return Promise.resolve(result);
      },
      onActiveChanged: (handler) => projects.activeChanged.subscribe(handler),
    },

    assets: {
      import: async (req) => {
        const file = await pickFile(req.kind);
        if (file === null) throw new Error('No file selected');
        return { asset: await assets.importFile(file, req.kind) };
      },
      list: () => assets.list(),
      remove: async (req) => ({ ok: await assets.remove(req.assetId) }),
      onImported: (handler) => assets.imported.subscribe(handler),
      onCleared: (handler) => assets.cleared.subscribe(handler),
      // D-011 — renderer-side blob URL lookup. Reads workspace bytes
      // and caches a blob URL per assetId so the preview / panel
      // thumbnails can reference `url(blob:...)` directly.
      url: async (assetId) => {
        const cached = assetUrlCache.get(assetId);
        if (cached !== undefined) return cached;
        const meta = await assets.get(assetId);
        if (meta === null) return null;
        const bytes = await assets.bytes(assetId);
        if (bytes === null) return null;
        const mime = mimeOf(meta.kind, meta.filename);
        // Copy to a fresh ArrayBuffer so the Blob owns its own backing
        // store (Uint8Array views can outlive the original buffer).
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        const blob = new Blob([ab], { type: mime });
        const url = URL.createObjectURL(blob);
        assetUrlCache.set(assetId, url);
        return url;
      },
    },

    export: {
      preflight: async (req) => ({ issues: await exporter.preflight(req.scene) }),
      run: (req) => exporter.run(req.scene, req.outputPath),
      runDisk: async (req) => {
        const { scene } = req;
        const sfp = window.showSaveFilePicker;
        if (sfp === undefined) {
          const filename = `${slugifyName(scene.name) || 'template'}.vcg`;
          const result = await exporter.run(scene, filename);
          return { ok: true, filename: result.path };
        }
        let handle = exportHandles.get(scene.id) ?? null;
        try {
          handle = await sfp({
            suggestedName: handle?.name ?? `${slugifyName(scene.name) || 'template'}.vcg`,
            types: [
              {
                description: 'cg Template package',
                accept: { 'application/octet-stream': ['.vcg'] },
              },
            ],
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return { ok: false, filename: null };
          }
          throw err;
        }
        exportHandles.set(scene.id, handle);
        const { vcg } = await exporter.produce(scene);
        const writable = await handle.createWritable();
        await writable.write(new Blob([vcg.slice()], { type: 'application/octet-stream' }));
        await writable.close();
        exporter.progress.emit({ step: 'done', progress: 1 });
        return { ok: true, filename: handle.name };
      },
      onProgress: (handler) => exporter.progress.subscribe(handler),
    },

    preview: {
      load: (req) => Promise.resolve(preview.load(req.scene)),
      update: (req) => Promise.resolve(preview.update(req.fields)),
      reload: () => Promise.resolve(preview.reload()),
    },
  };
}

function pickFile(kind?: 'image' | 'font' | 'lottie' | 'video'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (kind === 'image') input.accept = 'image/*';
    else if (kind === 'font')
      input.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    else if (kind === 'lottie') input.accept = 'application/json,.json';
    else if (kind === 'video') input.accept = 'video/*';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

function mimeOf(kind: 'image' | 'font' | 'lottie' | 'video', filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (kind === 'image') {
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'application/octet-stream';
  }
  if (kind === 'font') {
    if (ext === 'ttf') return 'font/ttf';
    if (ext === 'otf') return 'font/otf';
    if (ext === 'woff') return 'font/woff';
    if (ext === 'woff2') return 'font/woff2';
    return 'application/octet-stream';
  }
  if (kind === 'lottie') return 'application/json';
  if (kind === 'video') return ext === 'webm' ? 'video/webm' : 'video/mp4';
  return 'application/octet-stream';
}

/** File-system-safe slug — lower-case, ascii, hyphens, no extension. */
function slugifyName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s.-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .toLowerCase()
    .replace(/\.cg\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fallback save for browsers without `showSaveFilePicker` (Firefox).
 * Triggers the browser's native download mechanism with a sensible
 * filename so the operator can pick where to put the file.
 */
function triggerJsonDownload(scene: Scene, filename: string): void {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

async function pickJsonFile(): Promise<{ text: string; name: string } | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
  if (file === null) return null;
  return { text: await file.text(), name: file.name };
}
