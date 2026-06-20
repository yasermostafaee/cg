import { SceneSchema, type Element, type Scene } from '@cg/shared-schema';
import { getStarter } from '@cg/starter-templates';
import type { AppInfo, DesignerBridge } from '../shared/designer-bridge.js';
import { cgCss, cgJs, cgJsIife } from './cg-runtime.js';
// The app's bundled @font-face rules (Vazirmatn / Exo 2) as a raw CSS string,
// injected into the preview iframe so built-in fonts render on the canvas — the
// iframe is srcdoc (same origin), so its `/fonts/…` URLs resolve like the host.
import appFontsCss from '../renderer/fonts.css?inline';
import {
  isOpfsSupported,
  saveFileHandle,
  loadFileHandle,
  ensureHandlePermission,
} from '@cg/storage';
import { initWorkspace, prefs } from './workspace.js';
import { ProjectStore } from './ProjectStore.js';
import { AssetStore } from './AssetStore.js';
import { SharedImageStore } from './SharedImageStore.js';
import { Exporter } from './Exporter.js';
import { ExporterSingleFile } from './ExporterSingleFile.js';
import { Preview } from './preview.js';
import { pickFiles } from './pickFiles.js';

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
  // D-040 — the shared image library lives ONCE outside any project. Constructed
  // here and never re-scoped on project change. Both exporters take it so a
  // `source: 'shared'` logo resolves + inlines exactly like a per-project asset.
  const sharedImages = new SharedImageStore(ws);
  const exporter = new Exporter({ assets, sharedImages, cgJs, cgCss });
  const singleFile = new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: appFontsCss,
    assets,
    sharedImages,
  });
  const preview = new Preview({ cgJs, cgCss, fontsCss: appFontsCss });
  const assetUrlCache = new Map<string, string>();
  // D-040 — shared-library blob URLs. Separate from `assetUrlCache` and NOT
  // revoked on project change (the library outlives any one project); revoked
  // only when a library image is removed.
  const sharedImageUrlCache = new Map<string, string>();
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

  /**
   * Import a starter's bundled assets into the (now active) project and rewrite
   * the cloned scene's placeholder references to the real assetIds. Image
   * elements reference an asset by its `key`; fonts by the family `asset-<key>`.
   * Each placeholder is rewritten to the imported `assetId` (`asset-<id>` for
   * fonts). Failures (a missing seed file) are skipped so the template still
   * loads — just without that asset.
   */
  async function seedStarterAssets(starterId: string, scene: Scene): Promise<void> {
    const starter = getStarter(starterId);
    const manifest = starter?.assets ?? [];
    if (manifest.length === 0) return;
    const imageRemap = new Map<string, string>();
    const fontRemap = new Map<string, string>();
    for (const a of manifest) {
      try {
        const res = await fetch(a.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const meta = await assets.importFile(
          new File([blob], a.filename, { type: blob.type }),
          a.kind,
        );
        if (a.kind === 'font') fontRemap.set(`asset-${a.key}`, `asset-${meta.assetId}`);
        else imageRemap.set(a.key, meta.assetId);
      } catch {
        /* seed file unreachable — load the template without this asset */
      }
    }
    rewriteAssetRefs(scene, imageRemap, fontRemap);
  }

  function rewriteAssetRefs(
    scene: Scene,
    imageRemap: ReadonlyMap<string, string>,
    fontRemap: ReadonlyMap<string, string>,
  ): void {
    const fixEl = (el: Element): void => {
      if (el.type === 'image') {
        const next = imageRemap.get(el.assetId);
        if (next !== undefined) el.assetId = next;
      } else if (el.type === 'text') {
        const next = fontRemap.get(el.font.family);
        if (next !== undefined) el.font.family = next;
      } else if (el.type === 'container') {
        el.children.forEach(fixEl);
      }
    };
    for (const layer of scene.layers) layer.children.forEach(fixEl);
    for (const comp of scene.compositions ?? []) {
      for (const layer of comp.layers) layer.children.forEach(fixEl);
    }
    scene.fonts = scene.fonts.map((f) => {
      const next = fontRemap.get(f.family);
      return next === undefined ? f : { ...f, family: next };
    });
  }

  return {
    getAppInfo: () => Promise.resolve(APP_INFO),

    projects: {
      create: (req) =>
        Promise.resolve(
          projects.newScene(req.name, req.templateType, {
            ...(req.resolution !== undefined ? { resolution: req.resolution } : {}),
            ...(req.frameRate !== undefined ? { frameRate: req.frameRate } : {}),
            ...(req.durationFrames !== undefined ? { durationFrames: req.durationFrames } : {}),
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
      // D-088 — desktop document Save / Save As. The chosen FileSystemFileHandle is the
      // project's file, persisted in IndexedDB keyed by project id so Save keeps writing to
      // the same on-disk file across reloads. Tiered fallback: handle → OPFS (reopenable via
      // Recent) → download.
      saveDisk: async (req) => {
        const { scene, askPath } = req;
        const sfp = window.showSaveFilePicker;

        if (sfp !== undefined) {
          // Save (not Save As): reuse the project's persisted handle when usable.
          if (!askPath) {
            const cached = sceneSaveHandles.get(scene.id) ?? (await loadFileHandle(scene.id));
            if (cached !== null && (await ensureHandlePermission(cached))) {
              try {
                await writeSceneToHandle(cached, scene);
                sceneSaveHandles.set(scene.id, cached);
                projects.recordRecentHandle(scene);
                return { ok: true, filename: cached.name, handleKey: scene.id };
              } catch {
                // The write THREW — permission revoked, disk error, or an otherwise
                // invalid handle. Don't crash the save: tell the renderer to notice and
                // retry as Save As. (A merely deleted file does NOT land here — the
                // browser silently recreates it at the same handle location.)
                return { ok: false, filename: null, reason: 'write-failed' };
              }
            }
            // No usable handle (none, or permission denied) → fall through to Save As.
          }
          // Save As: pick a new file, persist its handle.
          let handle: FileSystemFileHandle;
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
          await writeSceneToHandle(handle, scene);
          sceneSaveHandles.set(scene.id, handle);
          await saveFileHandle(scene.id, handle);
          projects.recordRecentHandle(scene);
          return { ok: true, filename: handle.name, handleKey: scene.id };
        }

        // No File System Access → OPFS path-model (reopenable via Recent) → download.
        if (isOpfsSupported()) {
          const { path } = await projects.save(scene, scene.name);
          return { ok: true, filename: path };
        }
        const filename = `${slugifyName(scene.name) || 'untitled'}.cg.json`;
        triggerJsonDownload(scene, filename);
        return { ok: true, filename };
      },
      // D-088 — open via showOpenFilePicker so the file carries a writable handle.
      openDisk: async () => {
        const sop = window.showOpenFilePicker;
        if (sop === undefined) {
          // No File System Access — hidden input yields a File with no handle.
          const picked = await pickJsonFile();
          if (picked === null) return { scene: null, handleKey: null };
          return { scene: SceneSchema.parse(JSON.parse(picked.text)), handleKey: null };
        }
        let handles: FileSystemFileHandle[];
        try {
          handles = await sop({
            multiple: false,
            types: [
              {
                description: 'cg Designer scene',
                accept: { 'application/json': ['.json', '.cg.json'] },
              },
            ],
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return { scene: null, handleKey: null };
          }
          throw err;
        }
        const handle = handles[0];
        if (handle === undefined) return { scene: null, handleKey: null };
        const scene = await readSceneFromHandle(handle);
        sceneSaveHandles.set(scene.id, handle);
        await saveFileHandle(scene.id, handle);
        projects.recordRecentHandle(scene);
        return { scene, handleKey: scene.id };
      },
      // D-088 — reopen a Recent entry: re-acquire permission in the click, else needsPicker.
      openRecent: async (req) => {
        if (req.handleKey !== undefined) {
          const handle = await loadFileHandle(req.handleKey);
          if (handle !== null && (await ensureHandlePermission(handle))) {
            try {
              const scene = await readSceneFromHandle(handle);
              sceneSaveHandles.set(scene.id, handle);
              projects.recordRecentHandle(scene);
              return { scene, handleKey: scene.id, needsPicker: false };
            } catch {
              /* file moved / deleted / unreadable — fall back to the picker */
            }
          }
          return { scene: null, handleKey: null, needsPicker: true };
        }
        if (req.path !== undefined) {
          // Legacy path-keyed entry → OPFS path-model (upgrades to a handle on next save).
          const result = await projects.open(req.path);
          return { scene: result.scene, handleKey: null, needsPicker: false };
        }
        return { scene: null, handleKey: null, needsPicker: true };
      },
      recent: () => Promise.resolve(projects.recent()),
      // D-093 — remove a Recent entry (non-destructive: drops the entry + forgets the
      // handle/permission, never the file) / empty the whole list.
      forgetRecent: (req) => projects.forgetRecent(req),
      clearRecent: () => projects.clearRecent(),
      starters: () => Promise.resolve(projects.starters()),
      starter: async (req) => {
        const result = projects.loadStarter(req.starterId);
        if (result === null) throw new Error(`Unknown starter: ${req.starterId}`);
        // loadStarter has already activated the project, so the AssetStore is
        // now scoped to it. Seed any bundled font/image assets into that
        // project (they appear in the Assets panel) and rewrite the scene's
        // placeholder references in place to the freshly-minted assetIds.
        await seedStarterAssets(req.starterId, result.scene);
        return result;
      },
      onActiveChanged: (handler) => projects.activeChanged.subscribe(handler),
    },

    assets: {
      // D-067 — split pick + store so the caller drives multi-file imports: pick
      // returns the chosen files (one tile each), store imports one independently.
      pick: (kind) => pickFiles(kind),
      store: async (file, kind) => ({ asset: await assets.importFile(file, kind) }),
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

    sharedImages: {
      // D-067 — split pick + store (mirrors assets) for multi-file imports.
      pick: () => pickFiles('image'),
      store: async (file) => ({ image: await sharedImages.importFile(file) }),
      list: () => sharedImages.list(),
      remove: async (req) => {
        const cached = sharedImageUrlCache.get(req.assetId);
        if (cached !== undefined) {
          URL.revokeObjectURL(cached);
          sharedImageUrlCache.delete(req.assetId);
        }
        return { ok: await sharedImages.remove(req.assetId) };
      },
      onImported: (handler) => sharedImages.imported.subscribe(handler),
      // D-040 — blob URL lookup for the library panel / inspector / preview.
      // Mirrors `assets.url` but reads the shared store and its own cache.
      url: async (assetId) => {
        const cached = sharedImageUrlCache.get(assetId);
        if (cached !== undefined) return cached;
        const meta = await sharedImages.get(assetId);
        if (meta === null) return null;
        const bytes = await sharedImages.bytes(assetId);
        if (bytes === null) return null;
        const mime = mimeOf(meta.kind, meta.filename);
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        const blob = new Blob([ab], { type: mime });
        const url = URL.createObjectURL(blob);
        sharedImageUrlCache.set(assetId, url);
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
      runSingleFileHtml: async (req) => {
        const result = await singleFile.run(req.scene);
        return {
          filename: result.filename,
          bytes: result.bytes,
          warnings: result.issues.map((i) => i.message),
        };
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

/** D-088 — write a scene JSON payload to an open file handle. */
async function writeSceneToHandle(handle: FileSystemFileHandle, scene: Scene): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }));
  await writable.close();
}

/** D-088 — read + parse a scene from an open file handle. */
async function readSceneFromHandle(handle: FileSystemFileHandle): Promise<Scene> {
  const file = await handle.getFile();
  return SceneSchema.parse(JSON.parse(await file.text()));
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
