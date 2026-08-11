import { PROJECT_PACKAGE_EXT, type Element, type Scene } from '@cg/shared-schema';
import { packProject, readProjectDocument, type ProjectDocument } from '@cg/vcg-format';
import { getStarter } from '@cg/starter-templates';
import type { AppInfo, DesignerBridge } from '../shared/designer-bridge.js';
import {
  cgCss,
  cgJs,
  cgJsIife,
  cgJsLottie,
  cgJsLottieIife,
  ExporterSingleFile,
} from '@cg/single-file-export';
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
import {
  connectDirectory,
  initWorkspaceWithRoot,
  isDegradedRoot,
  isSessionOnlyRoot,
  prefs,
  isPersistentFolderSupported,
  workspaceRoot,
} from './workspace.js';
import { ProjectStore } from './ProjectStore.js';
import { AssetStore } from './AssetStore.js';
import { SharedImageStore } from './SharedImageStore.js';
import { Exporter } from './Exporter.js';
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
  const { workspace: ws } = await initWorkspaceWithRoot();
  const projects = new ProjectStore(ws, prefs);
  const assets = new AssetStore(ws);
  // D-040 — the shared image library lives ONCE outside any project. Constructed
  // here and never re-scoped on project change. Both exporters take it so a
  // `source: 'shared'` logo resolves + inlines exactly like a per-project asset.
  const sharedImages = new SharedImageStore(ws);
  const exporter = new Exporter({ assets, sharedImages, cgJs, cgJsLottie, cgCss });
  const singleFile = new ExporterSingleFile({
    cgJsIife,
    cgJsLottieIife,
    cgCss,
    fontsCss: appFontsCss,
    assets,
    sharedImages,
  });
  const preview = new Preview({ cgJs, cgJsLottie, cgCss, fontsCss: appFontsCss });
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
   * D-150 — build the `.cgproj` bytes for a scene: the authoring scene plus every
   * asset the project holds.
   *
   * The scene is passed WHOLE — no `withoutEditorBackdrop`. That helper belongs to
   * the export path (B-129); running it on a save would delete the author's canvas
   * backdrop every time they pressed Ctrl+S.
   */
  async function buildPackage(scene: Scene): Promise<Uint8Array> {
    const { index, files } = await assets.exportForPackage();
    return packProject({ scene, index, files, savedAt: new Date().toISOString() });
  }

  /**
   * D-150 — make a freshly-read document the active project, assets and all.
   *
   * ORDER IS LOAD-BEARING: `projects.activate` is what emits `activeChanged`, which is
   * what re-points the `AssetStore` at this project. Adopting before activating would
   * write the bytes into the PREVIOUS project's subtree (or throw, at boot, when there
   * is no active project at all).
   *
   * 🔴 The activate call is also a fix in its own right. Before this, the handle-based
   * entry points (`openDisk`, `openRecent`) never activated the opened project, so the
   * asset store stayed scoped to whatever came before — `null` at boot. The scene
   * rendered and the assets panel was empty every time, which is the other half of
   * B-104 and the half that needed no permission subtlety to reproduce.
   */
  async function adoptDocument(doc: ProjectDocument, path: string | null): Promise<void> {
    projects.activate(doc.scene, path);
    await assets.adoptFromPackage(doc.index, doc.files);
  }

  /** D-150 — write package bytes to the workspace path-model tier. */
  async function savePackageToWorkspace(
    scene: Scene,
    name: string,
    prebuilt?: Uint8Array,
  ): Promise<{ path: string }> {
    const bytes = prebuilt ?? (await buildPackage(scene));
    return projects.savePackageBytes(scene, bytes, name);
  }

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
      } else if (
        el.type === 'text' ||
        el.type === 'ticker' ||
        el.type === 'clock' ||
        el.type === 'sequence'
      ) {
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
        if (req.path !== undefined) {
          const bytes = await projects.readBytes(req.path);
          if (bytes === null) return { scene: null, path: null };
          const doc = await readProjectDocument(bytes);
          await adoptDocument(doc, req.path);
          return { scene: doc.scene, path: req.path };
        }
        const picked = await pickProjectFile();
        if (picked === null) return { scene: null, path: null };
        const doc = await readProjectDocument(picked.bytes);
        await adoptDocument(doc, null);
        const { path } = await savePackageToWorkspace(doc.scene, picked.name);
        return { scene: doc.scene, path };
      },
      save: (req) => projects.save(req.scene, req.path ?? req.scene.name),
      // D-088 — desktop document Save / Save As. The chosen FileSystemFileHandle is the
      // project's file, persisted in IndexedDB keyed by project id so Save keeps writing to
      // the same on-disk file across reloads. Tiered fallback: handle -> OPFS (reopenable
      // via Recent) -> download.
      //
      // D-150 — every tier now writes the SAME self-contained `.cgproj` package. A weaker
      // storage mechanism may not produce a weaker document: that asymmetry is what let a
      // project exist as a scene with no assets in the first place (B-104).
      saveDisk: async (req) => {
        const { scene, askPath } = req;
        const sfp = window.showSaveFilePicker;
        const bytes = await buildPackage(scene);
        /*
         * P-031 — THE FORCED-SAVE-AS RULE IS GONE WITH THE PATH THAT NEEDED IT, and
         * this is the judgment rather than a mechanical deletion.
         *
         * D-150 forced a converted project's first Save through the picker so a package
         * was never written over the `.cg.json` it came from. That rule earned its place
         * because opening produced a document in a DIFFERENT format from the one Save
         * writes — and that mismatch is the only thing it ever protected against.
         * Reading a `.cg.json` is no longer possible, so the mismatch is unreachable:
         * every document this app opens is already the format it saves. Keeping the
         * `Set` would leave a mechanism nothing can ever add to — precisely the dead
         * code that advertises itself as a safeguard that `P-031` exists to end.
         *
         * A real Save As is unaffected: `askPath` still forces the picker.
         */
        const forcePicker = askPath;

        if (sfp !== undefined) {
          // Save (not Save As): reuse the project's persisted handle when usable.
          if (!forcePicker) {
            const cached = sceneSaveHandles.get(scene.id) ?? (await loadFileHandle(scene.id));
            if (cached !== null && (await ensureHandlePermission(cached))) {
              try {
                await writeBytesToHandle(cached, bytes);
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
            // No usable handle (none, or permission denied) -> fall through to Save As.
          }
          // Save As: pick a new file, persist its handle.
          let handle: FileSystemFileHandle;
          try {
            handle = await sfp({
              suggestedName: `${slugifyName(scene.name) || 'untitled'}${PROJECT_PACKAGE_EXT}`,
              types: [
                {
                  description: 'cg Designer project',
                  accept: { 'application/zip': [PROJECT_PACKAGE_EXT] },
                },
              ],
            });
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return { ok: false, filename: null };
            }
            throw err;
          }
          await writeBytesToHandle(handle, bytes);
          sceneSaveHandles.set(scene.id, handle);
          await saveFileHandle(scene.id, handle);
          projects.recordRecentHandle(scene);
          return { ok: true, filename: handle.name, handleKey: scene.id };
        }

        // No File System Access -> workspace path-model (reopenable via Recent) -> download.
        if (isOpfsSupported()) {
          const { path } = await savePackageToWorkspace(scene, scene.name, bytes);
          return { ok: true, filename: path };
        }
        const filename = `${slugifyName(scene.name) || 'untitled'}${PROJECT_PACKAGE_EXT}`;
        triggerPackageDownload(bytes, filename);
        return { ok: true, filename };
      },
      // D-088 — open via showOpenFilePicker so the file carries a writable handle.
      openDisk: async () => {
        const sop = window.showOpenFilePicker;
        if (sop === undefined) {
          // No File System Access — hidden input yields a File with no handle.
          const picked = await pickProjectFile();
          if (picked === null) return { scene: null, handleKey: null };
          const doc = await readProjectDocument(picked.bytes);
          await adoptDocument(doc, null);
          return { scene: doc.scene, handleKey: null };
        }
        let handles: FileSystemFileHandle[];
        try {
          handles = await sop({
            multiple: false,
            types: [
              {
                description: 'cg Designer project',
                // Legacy `.cg.json` stays openable — it must, or every project authored
                // before the package format becomes unreachable.
                accept: {
                  'application/zip': [PROJECT_PACKAGE_EXT],
                  'application/json': ['.json', '.cg.json'],
                },
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
        const doc = await readProjectDocument(await readBytesFromHandle(handle));
        await adoptDocument(doc, null);
        sceneSaveHandles.set(doc.scene.id, handle);
        await saveFileHandle(doc.scene.id, handle);
        projects.recordRecentHandle(doc.scene);
        return { scene: doc.scene, handleKey: doc.scene.id };
      },
      // D-088 — reopen a Recent entry: re-acquire permission in the click, else needsPicker.
      openRecent: async (req) => {
        if (req.handleKey !== undefined) {
          const handle = await loadFileHandle(req.handleKey);
          if (handle !== null && (await ensureHandlePermission(handle))) {
            try {
              const doc = await readProjectDocument(await readBytesFromHandle(handle));
              await adoptDocument(doc, null);
              sceneSaveHandles.set(doc.scene.id, handle);
              projects.recordRecentHandle(doc.scene);
              return { scene: doc.scene, handleKey: doc.scene.id, needsPicker: false };
            } catch {
              /* file moved / deleted / unreadable — fall back to the picker */
            }
          }
          return { scene: null, handleKey: null, needsPicker: true };
        }
        if (req.path !== undefined) {
          // Legacy path-keyed entry -> workspace path-model (upgrades to a handle on save).
          const bytes = await projects.readBytes(req.path);
          if (bytes === null) return { scene: null, handleKey: null, needsPicker: true };
          const doc = await readProjectDocument(bytes);
          await adoptDocument(doc, req.path);
          return { scene: doc.scene, handleKey: null, needsPicker: false };
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

    /**
     * D-150 — the storage ROOT, surfaced. `initWorkspace` used to swallow both of its
     * failure legs in bare `catch {}`s, so the author was moved to a different root
     * without a word — and `projects/<id>/assets/...` then resolved somewhere else
     * entirely. That silence is half of B-104; this namespace is what ends it.
     */
    storage: {
      state: () => {
        const root = workspaceRoot();
        return Promise.resolve({
          kind: root.kind,
          label: root.label,
          reason: root.reason,
          degraded: isDegradedRoot(root),
          sessionOnly: isSessionOnlyRoot(root),
          canConnectFolder: isPersistentFolderSupported(),
          ...(root.folderName !== undefined ? { folderName: root.folderName } : {}),
          ...(root.detail !== undefined ? { detail: root.detail } : {}),
        });
      },
      /**
       * Re-grant the connected folder. MUST be called from a user GESTURE: Chromium
       * refuses `requestPermission()` without one, and boot has none. That is exactly
       * why a lost folder cannot be repaired at startup and has to become an action
       * the author takes.
       */
      reconnectFolder: async () => {
        await connectDirectory();
        const root = workspaceRoot();
        return { ok: true, label: root.label };
      },
    },

    assets: {
      // D-067 — split pick + store so the caller drives multi-file imports: pick
      // returns the chosen files (one tile each), store imports one independently.
      pick: (kind) => pickFiles(kind),
      store: async (file, kind) => ({ asset: await assets.importFile(file, kind) }),
      // D-128 — raw-bytes ingest for the in-app video converter's canonical WebM
      // (+ optional source provenance). Same dedupe/index path as store().
      storeBytes: async (req) => ({
        asset: await assets.importBytes(req.bytes, req.filename, req.kind, req.provenance),
      }),
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
      load: (req) =>
        Promise.resolve(preview.load(req.scene, req.broadcast, req.authoring, req.frameOffset)),
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

/** D-150 — write raw package bytes to an open file handle. */
async function writeBytesToHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  await writable.close();
}

/** D-150 — read raw bytes from an open file handle. */
async function readBytesFromHandle(handle: FileSystemFileHandle): Promise<Uint8Array> {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * D-150 — trigger a download of the project package (the last-resort save tier).
 * The bytes are the SAME package every other tier writes: degrading the storage
 * mechanism must never degrade the document.
 */
function triggerPackageDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
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

async function pickProjectFile(): Promise<{ bytes: Uint8Array; name: string } | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // Both forms: the package, and the pre-package JSON that must still open.
    input.accept = '.cgproj,.json,application/json,application/zip';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
  if (file === null) return null;
  return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name };
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
