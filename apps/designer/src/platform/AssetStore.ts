import type { AssetMeta, VideoProvenance } from '@cg/shared-ipc';
import type { ProjectAssetEntry } from '@cg/shared-schema';
import { sha256Hex } from '@cg/vcg-format';
import type { Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';
import { uuid } from './uuid.js';

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
    // Delegates to the ONE byte-writing path so File- and bytes-ingest can never
    // drift (dedupe, path scheme, index persistence — and any B-104 fix — are shared).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = extOf(file.name);
    const kind = kindHint ?? KIND_BY_EXT[ext] ?? 'image';
    return this.importBytes(bytes, file.name, kind);
  }

  /**
   * D-128 — the real byte-writing ingest: store already-produced bytes (e.g. the
   * canonical WebM the in-app converter emitted) as an asset. Same dedupe-by-sha,
   * same `projects/<projectId>/assets/<kind>/<sha>.<ext>` scheme, same
   * index+persist+emit as `importFile` (which delegates here). Optional
   * `provenance` records the source lineage for converted video (crop rect,
   * source/target fps, source dimensions) — see `VideoProvenanceSchema`.
   */
  async importBytes(
    bytes: Uint8Array,
    filename: string,
    kind: AssetMeta['kind'],
    provenance?: VideoProvenance,
  ): Promise<AssetMeta> {
    if (this.#projectId === null) {
      throw new Error('Cannot import an asset before a project is active');
    }
    await this.#ensureLoaded();
    const sha256 = sha256Hex(bytes);
    const existing = [...this.#index.values()].find((m) => m.sha256 === sha256);
    if (existing !== undefined) return existing;

    const ext = extOf(filename);
    const workingPath = this.#bytesPath(kind, sha256, ext);
    if (workingPath === null) {
      throw new Error('Cannot import an asset before a project is active');
    }
    await this.#ws.writeFile(workingPath, bytes);

    const meta: AssetMeta = {
      assetId: uuid(),
      kind,
      filename,
      sha256,
      byteSize: bytes.byteLength,
      workingPath,
      ...(provenance !== undefined ? { provenance } : {}),
    };
    this.#index.set(meta.assetId, meta);
    await this.#persistIndex();
    this.imported.emit(meta);
    return meta;
  }

  /**
   * D-150 — the in-PACKAGE path for an asset: the same `<kind>/<sha>.<ext>` layout
   * `#bytesPath` uses, WITHOUT the `projects/<projectId>/` prefix.
   *
   * Dropping that prefix is the fix in one line. The prefix is what made an asset's
   * location depend on which storage root happened to be active, and a storage root
   * that silently changes across a browser restart is B-104. A package path means the
   * same thing in every copy of the file, on every machine.
   */
  static packagePath(meta: AssetMeta): string {
    const ext = extOf(meta.filename);
    return `assets/${meta.kind}/${meta.sha256}${ext ? `.${ext}` : ''}`;
  }

  /**
   * D-150 — everything the project package needs to carry this project's assets.
   *
   * The `sha256` on each entry is REUSED from import time, never recomputed: hashing
   * measured MORE expensive than the zip write itself (55 ms vs 45 ms on an 8.5 MB
   * project), and the value is already stored. An asset whose bytes have gone missing
   * from the workspace is REPORTED, not silently dropped — a package that quietly
   * omits an asset would be this bug wearing a new coat.
   */
  async exportForPackage(): Promise<{
    index: ProjectAssetEntry[];
    files: Map<string, Uint8Array>;
    missing: AssetMeta[];
  }> {
    await this.#ensureLoaded();
    const index: ProjectAssetEntry[] = [];
    const files = new Map<string, Uint8Array>();
    const missing: AssetMeta[] = [];
    for (const meta of this.#index.values()) {
      const bytes = await this.#ws.readFile(meta.workingPath);
      if (bytes === null) {
        missing.push(meta);
        continue;
      }
      const path = AssetStore.packagePath(meta);
      const { workingPath: _workingPath, ...rest } = meta;
      index.push({ ...rest, path });
      files.set(path, bytes);
    }
    return { index, files, missing };
  }

  /**
   * D-150 — restore a package's assets into the active project's workspace subtree
   * and rebuild the in-memory index.
   *
   * Idempotent: entries are keyed by `assetId` and the bytes are content-addressed by
   * sha, so opening the same package twice writes the same paths and lists each asset
   * once. `provenance` and the other import-time facts come back verbatim from the
   * manifest — they cannot be reconstructed from bytes, which is why the manifest
   * carries them.
   */
  async adoptFromPackage(
    index: readonly ProjectAssetEntry[],
    files: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    if (this.#projectId === null) {
      throw new Error('Cannot adopt package assets before a project is active');
    }
    this.#index.clear();
    for (const entry of index) {
      const bytes = files.get(entry.path);
      if (bytes === undefined) continue;
      const { path: _path, ...meta } = entry;
      const workingPath = this.#bytesPath(meta.kind, meta.sha256, extOf(meta.filename));
      if (workingPath === null) continue;
      await this.#ws.writeFile(workingPath, bytes);
      this.#index.set(meta.assetId, { ...meta, workingPath });
    }
    this.#loaded = true;
    await this.#persistIndex();
    this.cleared.emit();
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
