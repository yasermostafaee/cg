import type { AssetMeta } from '@cg/shared-ipc';
import { sha256Hex } from '@cg/vcg-format';
import type { Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';

const INDEX_PATH = 'assets/index.json';

const KIND_BY_EXT: Record<string, AssetMeta['kind']> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  json: 'lottie',
  mp4: 'video',
  webm: 'video',
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * Browser port of the Electron AssetService. Imported files are hashed,
 * deduped by sha256, and written into the Workspace under
 * `assets/<kind>/<sha>.<ext>`. The metadata index is persisted so assets
 * survive reloads. `workingPath` is the workspace-relative path.
 */
export class AssetStore {
  readonly imported = new Emitter<AssetMeta>();
  #index = new Map<string, AssetMeta>();
  #loaded = false;
  readonly #ws: Workspace;

  constructor(ws: Workspace) {
    this.#ws = ws;
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    const saved = await this.#ws.readJson<AssetMeta[]>(INDEX_PATH);
    if (saved !== null) for (const m of saved) this.#index.set(m.assetId, m);
    this.#loaded = true;
  }

  async #persistIndex(): Promise<void> {
    await this.#ws.writeJson(INDEX_PATH, [...this.#index.values()]);
  }

  /** Import a picked File. Dedupes identical bytes by sha256. */
  async importFile(file: File, kindHint?: AssetMeta['kind']): Promise<AssetMeta> {
    await this.#ensureLoaded();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = sha256Hex(bytes);
    const existing = [...this.#index.values()].find((m) => m.sha256 === sha256);
    if (existing !== undefined) return existing;

    const ext = extOf(file.name);
    const kind = kindHint ?? KIND_BY_EXT[ext] ?? 'image';
    const workingPath = `assets/${kind}/${sha256}${ext ? `.${ext}` : ''}`;
    await this.#ws.writeFile(workingPath, bytes);

    const meta: AssetMeta = {
      assetId: crypto.randomUUID(),
      kind,
      filename: file.name,
      sha256,
      byteSize: bytes.byteLength,
      workingPath,
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

  /** Read an asset's bytes from the workspace. */
  async bytes(assetId: string): Promise<Uint8Array | null> {
    const meta = await this.get(assetId);
    if (meta === null) return null;
    return this.#ws.readFile(meta.workingPath);
  }

  async remove(assetId: string): Promise<boolean> {
    await this.#ensureLoaded();
    const removed = this.#index.delete(assetId);
    if (removed) await this.#persistIndex();
    return removed;
  }
}
