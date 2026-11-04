import type { AssetMeta } from '@cg/shared-ipc';
import { sha256Hex } from '@cg/vcg-format';
import type { Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';
import { uuid } from './uuid.js';

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * D-126 — the project-independent shared font byte store. It deliberately mirrors
 * `SharedImageStore` while keeping a separate namespace and typed API: bytes live
 * under `shared/fonts/`, metadata reuses `AssetMeta`, and identical bytes dedupe by
 * sha256 across every project.
 */
export class SharedFontStore {
  readonly imported = new Emitter<AssetMeta>();
  #index = new Map<string, AssetMeta>();
  #loaded = false;
  readonly #ws: Workspace;

  constructor(ws: Workspace) {
    this.#ws = ws;
  }

  #indexPath(): string {
    return 'shared/fonts/index.json';
  }

  #bytesPath(sha256: string, ext: string): string {
    return `shared/fonts/${sha256}${ext === '' ? '' : `.${ext}`}`;
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    const saved = await this.#ws.readJson<AssetMeta[]>(this.#indexPath());
    if (saved !== null) {
      for (const meta of saved) {
        if (meta.kind === 'font') this.#index.set(meta.assetId, meta);
      }
    }
    this.#loaded = true;
  }

  async #persistIndex(): Promise<void> {
    await this.#ws.writeJson(this.#indexPath(), [...this.#index.values()]);
  }

  async importFile(file: File): Promise<AssetMeta> {
    await this.#ensureLoaded();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = sha256Hex(bytes);
    const existing = [...this.#index.values()].find((meta) => meta.sha256 === sha256);
    if (existing !== undefined) return existing;

    const workingPath = this.#bytesPath(sha256, extOf(file.name));
    await this.#ws.writeFile(workingPath, bytes);
    const meta: AssetMeta = {
      assetId: uuid(),
      kind: 'font',
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

  async bytes(assetId: string): Promise<Uint8Array | null> {
    const meta = await this.get(assetId);
    return meta === null ? null : this.#ws.readFile(meta.workingPath);
  }

  async remove(assetId: string): Promise<boolean> {
    await this.#ensureLoaded();
    const removed = this.#index.delete(assetId);
    if (removed) await this.#persistIndex();
    return removed;
  }
}
