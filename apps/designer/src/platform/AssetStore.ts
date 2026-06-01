import type { AssetMeta } from '@cg/shared-ipc';
import { sha256Hex } from '@cg/vcg-format';
import type { Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';

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
 * `projects/<projectId>/assets/<kind>/<sha>.<ext>`. The metadata index is
 * persisted so assets survive reloads. `workingPath` is the workspace-
 * relative path.
 *
 * Assets are scoped to the currently-active project — see
 * [[assets-are-per-project]]. When the active project changes, callers
 * must invoke `setActiveProject(newId)` and the store flushes its in
 * -memory index, re-reads from the new project's subtree, and fires the
 * `cleared` emitter so renderer-side caches can drop stale URLs / font
 * faces.
 */
export class AssetStore {
  readonly imported = new Emitter<AssetMeta>();
  readonly cleared = new Emitter<void>();
  #projectId: string | null = null;
  #index = new Map<string, AssetMeta>();
  #loaded = false;
  readonly #ws: Workspace;

  constructor(ws: Workspace) {
    this.#ws = ws;
  }

  /**
   * Switch the active project the store reads from / writes to. Pass
   * `null` to detach (boot state, or after closing a project). The
   * `cleared` event fires whenever the active project actually changes
   * so subscribers can drop derived state.
   */
  setActiveProject(projectId: string | null): void {
    if (projectId === this.#projectId) return;
    this.#projectId = projectId;
    this.#index.clear();
    this.#loaded = false;
    this.cleared.emit();
  }

  #indexPath(): string | null {
    if (this.#projectId === null) return null;
    return `projects/${this.#projectId}/assets/index.json`;
  }

  #bytesPath(kind: AssetMeta['kind'], sha256: string, ext: string): string | null {
    if (this.#projectId === null) return null;
    return `projects/${this.#projectId}/assets/${kind}/${sha256}${ext ? `.${ext}` : ''}`;
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    const path = this.#indexPath();
    if (path === null) {
      this.#loaded = true;
      return;
    }
    const saved = await this.#ws.readJson<AssetMeta[]>(path);
    if (saved !== null) for (const m of saved) this.#index.set(m.assetId, m);
    this.#loaded = true;
  }

  async #persistIndex(): Promise<void> {
    const path = this.#indexPath();
    if (path === null) return;
    await this.#ws.writeJson(path, [...this.#index.values()]);
  }

  /** Import a picked File. Dedupes identical bytes by sha256. */
  async importFile(file: File, kindHint?: AssetMeta['kind']): Promise<AssetMeta> {
    if (this.#projectId === null) {
      throw new Error('Cannot import an asset before a project is active');
    }
    await this.#ensureLoaded();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = sha256Hex(bytes);
    const existing = [...this.#index.values()].find((m) => m.sha256 === sha256);
    if (existing !== undefined) return existing;

    const ext = extOf(file.name);
    const kind = kindHint ?? KIND_BY_EXT[ext] ?? 'image';
    const workingPath = this.#bytesPath(kind, sha256, ext);
    if (workingPath === null) {
      throw new Error('Cannot import an asset before a project is active');
    }
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
