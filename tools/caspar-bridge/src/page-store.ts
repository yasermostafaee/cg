import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync } from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PAGE_MAX_BYTES,
  PAGE_MAX_PIXELS,
  PAGE_MAX_SIDE,
  pageRefusalMessage,
  probeImage,
  type ImageProbe,
  type PageRefusalCode,
} from '@cg/shared-ipc';
import { pageMediaPath } from '@cg/shared-schema';

/**
 * `R-100` — **A BOOK'S PAGES, as CG Bridge keeps them.**
 *
 * One file per picture, named by its SHA-256 — so a picture two rows (or two consoles) load is
 * stored once — beside the template store, never inside it (the registry reads every file there as
 * a template, `B-116`). The name also carries the picture's size (`<sha>-<w>x<h>.<ext>`), so a
 * restart re-reads the index from the directory listing without decoding a single file.
 *
 * Pages are kept while some row names them; {@link sweep} deletes the rest (a row removed, a book
 * replaced, and at start against the restored rows). A store with no directory is in memory only —
 * tests and embedders — and forgets everything with the process, as the template registry does.
 */
export interface StoredPage extends ImageProbe {
  sha256: string;
  bytes: number;
}

export type PagePutResult =
  | { ok: true; page: StoredPage }
  | { ok: false; code: PageRefusalCode; message: string };

const EXT: Record<ImageProbe['mime'], 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MIME_OF_EXT: Record<string, ImageProbe['mime']> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};
const FILE_RE = /^([0-9a-f]{64})-(\d+)x(\d+)\.(png|jpg|webp)$/;

export class PageStore {
  readonly #dir: string | null;
  readonly #index = new Map<string, StoredPage>();
  /** In-memory bytes, used only when there is no directory. */
  readonly #memory = new Map<string, Buffer>();
  /** When each picture was last PUT in this process — the sweep's grace (see {@link sweep}). */
  readonly #putAt = new Map<string, number>();
  /** Pictures some row has NAMED since this process started: they get no grace once unnamed. */
  readonly #named = new Set<string>();

  constructor(dir: string | null) {
    this.#dir = dir;
    if (dir === null) return;
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(dir)) {
      const m = FILE_RE.exec(file);
      if (m === null) continue; // a tmp file or a stranger: not a page
      const [, sha256, w, h, ext] = m;
      const mime = MIME_OF_EXT[ext ?? ''];
      if (sha256 === undefined || mime === undefined) continue;
      this.#index.set(sha256, { sha256, mime, width: Number(w), height: Number(h), bytes: 0 });
    }
  }

  /** The page named by this hash, when the bridge holds it. */
  get(sha256: string): StoredPage | undefined {
    return this.#index.get(sha256);
  }

  /** Every page held, by hash. */
  hashes(): string[] {
    return [...this.#index.keys()];
  }

  /**
   * Record that a row NAMES these pictures (its page list was accepted, or read for a take or a
   * turn). A named picture that no row names any more is deleted by the next sweep at once — the
   * grace is only for a picture still waiting for the list that will name it.
   */
  markNamed(hashes: Iterable<string>): void {
    for (const sha256 of hashes) this.#named.add(sha256);
  }

  /**
   * Store one picture, after checking it is one and within the limits. Idempotent: the same bytes
   * twice are one file, and the second call answers the first's page. Nothing is stored on refusal.
   */
  async put(bytes: Buffer, name: string): Promise<PagePutResult> {
    if (bytes.byteLength > PAGE_MAX_BYTES) {
      return refuse('page-too-large', { name, bytes: bytes.byteLength });
    }
    const probe = probeImage(bytes);
    if (probe === null) return refuse('page-not-a-picture', { name });
    if (
      probe.width > PAGE_MAX_SIDE ||
      probe.height > PAGE_MAX_SIDE ||
      probe.width * probe.height > PAGE_MAX_PIXELS
    ) {
      return refuse('page-too-many-pixels', { name, width: probe.width, height: probe.height });
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    this.#putAt.set(sha256, Date.now());
    const known = this.#index.get(sha256);
    if (known !== undefined) return { ok: true, page: known };
    const page: StoredPage = { sha256, ...probe, bytes: bytes.byteLength };
    if (this.#dir === null) {
      this.#memory.set(sha256, Buffer.from(bytes));
    } else {
      const file = path.join(this.#dir, fileName(page));
      const tmp = `${file}.${String(process.pid)}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, file);
    }
    this.#index.set(sha256, page);
    return { ok: true, page };
  }

  /**
   * Where a page fetches this picture from — its own template origin, {@link pageMediaPath} — or
   * `null` when it is not held. A page turn names this; it never carries the bytes (CasparCG keeps
   * every `CG UPDATE`'s bytes in memory, `control-payload.ts`).
   */
  pathOf(sha256: string): string | null {
    const page = this.#index.get(sha256);
    return page === undefined ? null : pageMediaPath(page.sha256, EXT[page.mime]);
  }

  /** The picture's bytes and type, for the template server's page route; `null` when not held. */
  async read(sha256: string): Promise<{ bytes: Buffer; mime: StoredPage['mime'] } | null> {
    const page = this.#index.get(sha256);
    if (page === undefined) return null;
    const bytes =
      this.#dir === null
        ? this.#memory.get(sha256)
        : await readFile(path.join(this.#dir, fileName(page))).catch(() => undefined);
    return bytes === undefined ? null : { bytes, mime: page.mime };
  }

  /**
   * Delete every page NOT in `keep`, except one PUT within `graceMs`: a console sending a 300-page
   * book has stored the first pages long before it applies the list that names them, and a sweep in
   * between (another row removed) must not delete them under it. After a restart nothing is recent,
   * so the start-up sweep removes every unnamed page. Returns how many were deleted.
   */
  async sweep(keep: ReadonlySet<string>, now = Date.now(), graceMs = 30 * 60_000): Promise<number> {
    let removed = 0;
    for (const [sha256, page] of [...this.#index]) {
      if (keep.has(sha256)) {
        this.#named.add(sha256);
        continue;
      }
      const putAt = this.#putAt.get(sha256);
      if (!this.#named.has(sha256) && putAt !== undefined && now - putAt < graceMs) continue;
      this.#named.delete(sha256);
      this.#index.delete(sha256);
      this.#memory.delete(sha256);
      this.#putAt.delete(sha256);
      if (this.#dir !== null) {
        await unlink(path.join(this.#dir, fileName(page))).catch(() => undefined);
      }
      removed += 1;
    }
    return removed;
  }
}

function fileName(page: StoredPage): string {
  return `${page.sha256}-${String(page.width)}x${String(page.height)}.${EXT[page.mime]}`;
}

function refuse(
  code: PageRefusalCode,
  detail: Parameters<typeof pageRefusalMessage>[1],
): PagePutResult {
  return { ok: false, code, message: pageRefusalMessage(code, detail) };
}
