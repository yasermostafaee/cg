import type { AssetMeta } from '@cg/shared-ipc';
import { sha256Hex } from '@cg/vcg-format';
import type { Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';
import { uuid } from './uuid.js';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * Decode an image's pixel dimensions when the browser supports it, so the logo
 * tool can size a freshly-inserted element to the image's aspect ratio. Returns
 * `{}` (no dimensions) under the node test runner or for formats `createImageBitmap`
 * can't decode (e.g. some SVGs) — callers fall back to a square.
 */
async function decodeDimensions(
  bytes: Uint8Array,
  mime: string,
): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap === 'undefined' || typeof Blob === 'undefined') return {};
  try {
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const bitmap = await createImageBitmap(new Blob([ab], { type: mime }));
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims.width > 0 && dims.height > 0 ? dims : {};
  } catch {
    return {};
  }
}

/**
 * D-040 — the device-level shared image library store. Mirrors the per-project
 * {@link AssetStore} byte/dedupe surface (`importFile` / `list` / `get` / `bytes`
 * / `remove`, sha256 dedupe, the `AssetMeta` shape) but lives ONCE outside any
 * project: bytes go under `shared/images/<sha>.<ext>` and the index under
 * `shared/images/index.json`, both project-independent. There is no
 * `setActiveProject` and no `cleared` event — the library persists across project
 * switches and sessions. "Shared" means shared across projects on this storage
 * backend; there is no central/cross-machine backend.
 *
 * A shared image referenced by a `source: 'shared'` image element is a "logo".
 * At export the resolved bytes are inlined into the `.vcg` / single-file HTML
 * exactly like a per-project asset (see `image-export.ts`), so the played file
 * never reaches back to the library.
 */
export class SharedImageStore {
  readonly imported = new Emitter<AssetMeta>();
  #index = new Map<string, AssetMeta>();
  #loaded = false;
  readonly #ws: Workspace;

  constructor(ws: Workspace) {
    this.#ws = ws;
  }

  #indexPath(): string {
    return 'shared/images/index.json';
  }

  #bytesPath(sha256: string, ext: string): string {
    return `shared/images/${sha256}${ext ? `.${ext}` : ''}`;
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    const saved = await this.#ws.readJson<AssetMeta[]>(this.#indexPath());
    if (saved !== null) for (const m of saved) this.#index.set(m.assetId, m);
    this.#loaded = true;
  }

  async #persistIndex(): Promise<void> {
    await this.#ws.writeJson(this.#indexPath(), [...this.#index.values()]);
  }

  /** Import a picked image File into the library. Dedupes identical bytes by sha256. */
  async importFile(file: File): Promise<AssetMeta> {
    await this.#ensureLoaded();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = sha256Hex(bytes);
    const existing = [...this.#index.values()].find((m) => m.sha256 === sha256);
    if (existing !== undefined) return existing;

    const ext = extOf(file.name);
    const workingPath = this.#bytesPath(sha256, ext);
    await this.#ws.writeFile(workingPath, bytes);

    const mime = IMAGE_MIME_BY_EXT[ext] ?? 'application/octet-stream';
    const { width, height } = await decodeDimensions(bytes, mime);

    const meta: AssetMeta = {
      assetId: uuid(),
      kind: 'image',
      filename: file.name,
      sha256,
      byteSize: bytes.byteLength,
      workingPath,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
    this.#index.set(meta.assetId, meta);
    await this.#persistIndex();
    this.imported.emit(meta);
    return meta;
  }

  async list(): Promise<AssetMeta[]> {
    await this.#ensureLoaded();
    return [...this.#index.values()];
  }

  async get(assetId: string): Promise<AssetMeta | null> {
    await this.#ensureLoaded();
    return this.#index.get(assetId) ?? null;
  }

  /** Read a library image's bytes from the workspace. */
  async bytes(assetId: string): Promise<Uint8Array | null> {
    const meta = await this.get(assetId);
    if (meta === null) return null;
    return this.#ws.readFile(meta.workingPath);
  }

  /**
   * Remove a library image's index entry. Mirrors {@link AssetStore.remove}:
   * the bytes are left on disk (dedupe-safe) — projects that already exported the
   * image inlined its bytes and are unaffected.
   */
  async remove(assetId: string): Promise<boolean> {
    await this.#ensureLoaded();
    const removed = this.#index.delete(assetId);
    if (removed) await this.#persistIndex();
    return removed;
  }
}
