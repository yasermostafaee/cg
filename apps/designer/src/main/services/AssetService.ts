import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * AssetService — imports source files into the project's sandboxed
 * working directory, hashed + deduped.
 *
 * The working directory layout:
 *
 *   <workingRoot>/
 *     image/<sha256>.<ext>
 *     font/<sha256>.<ext>
 *     ...
 *
 * Sandbox rationale: the .vcg export pipeline reads from the working
 * dir, not arbitrary operator paths. This prevents a malicious scene
 * from referencing a path outside the project (e.g. `C:\Windows\...`).
 *
 * EXIF strip / orientation normalization arrives with M8 (binary asset
 * pipeline). For M6.1 the import path just copies bytes verbatim.
 */

export interface AssetServiceOptions {
  /** Absolute path to the per-project working directory. */
  workingRoot: string;
  /** Override for tests — defaults to `node:crypto.randomUUID`. */
  randomId?: () => string;
}

export interface AssetServiceEvents {
  imported: [meta: AssetMeta];
}

const KIND_BY_EXT: Record<string, AssetMeta['kind']> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.ttf': 'font',
  '.otf': 'font',
  '.woff': 'font',
  '.woff2': 'font',
  '.json': 'lottie',
  '.mp4': 'video',
  '.webm': 'video',
};

export class AssetService extends EventEmitter<AssetServiceEvents> {
  private readonly imports = new Map<string, AssetMeta>();
  private readonly workingRoot: string;
  private readonly randomId: () => string;

  constructor(options: AssetServiceOptions) {
    super();
    this.workingRoot = options.workingRoot;
    this.randomId = options.randomId ?? ((): string => crypto.randomUUID());
  }

  /**
   * Import `sourcePath` into the working directory. Files with the same
   * sha256 are deduped — the second import returns the existing meta.
   */
  async import(sourcePath: string, kindHint?: AssetMeta['kind']): Promise<AssetMeta> {
    const bytes = await fs.promises.readFile(sourcePath);
    const sha256 = sha256Hex(bytes);
    const dedup = this.findBySha(sha256);
    if (dedup !== null) return dedup;

    const ext = path.extname(sourcePath).toLowerCase();
    const kind = kindHint ?? KIND_BY_EXT[ext] ?? 'image';
    const subdir = path.join(this.workingRoot, kind);
    await fs.promises.mkdir(subdir, { recursive: true });
    const workingPath = path.join(subdir, `${sha256}${ext}`);
    await fs.promises.writeFile(workingPath, bytes);

    const meta: AssetMeta = {
      assetId: this.randomId(),
      kind,
      filename: path.basename(sourcePath),
      sha256,
      byteSize: bytes.byteLength,
      workingPath,
    };
    this.imports.set(meta.assetId, meta);
    this.emit('imported', meta);
    return meta;
  }

  /** Snapshot of all assets imported into this project. */
  list(): readonly AssetMeta[] {
    return [...this.imports.values()];
  }

  /** Delete an asset record (does NOT delete the working-dir file by design). */
  remove(assetId: string): boolean {
    return this.imports.delete(assetId);
  }

  /** Get a single asset by id. */
  get(assetId: string): AssetMeta | null {
    return this.imports.get(assetId) ?? null;
  }

  private findBySha(sha256: string): AssetMeta | null {
    for (const meta of this.imports.values()) {
      if (meta.sha256 === sha256) return meta;
    }
    return null;
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
