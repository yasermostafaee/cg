import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import {
  probeUpcomingMedia,
  UPCOMING_MEDIA_MAX_BASE64_LENGTH,
  UPCOMING_MEDIA_MAX_BYTES,
  UpcomingMediaMimeSchema,
  type UpcomingMediaGetRequest,
  type UpcomingMediaGetResult,
  type UpcomingMediaMime,
  type UpcomingMediaPutRequest,
  type UpcomingMediaPutResult,
  type UpcomingMediaRemoveRequest,
  type UpcomingMediaRemoveResult,
} from '@cg/shared-ipc';

const MEDIA_HASH = /^[0-9a-f]{64}$/;
const UPLOAD_GRACE_MS = 30 * 60_000;
// The first byte of a stored object holds a stable MIME tag. These codes are on disk.
const MIME_TAG: Record<UpcomingMediaMime, number> = {
  'image/png': 0,
  'image/jpeg': 1,
  'image/webp': 2,
  'video/webm': 3,
  'video/mp4': 4,
};
const MIME_FROM_TAG = new Map(
  UpcomingMediaMimeSchema.options.map((mime) => [MIME_TAG[mime], mime]),
);

export interface StoredUpcomingMedia {
  readonly bytes: Buffer;
  readonly mime: UpcomingMediaMime;
}

export function createUpcomingMediaStore(directory?: string | null): UpcomingMediaStore {
  return new UpcomingMediaStore(directory ?? null);
}

/** Validated media addressed solely by its content hash, separate from the template registry. */
export class UpcomingMediaStore {
  readonly #memory = new Map<string, StoredUpcomingMedia>();
  readonly #recentUses = new Map<string, number>();
  #pendingMutation: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string | null) {}

  async put({ mime, base64 }: UpcomingMediaPutRequest): Promise<UpcomingMediaPutResult> {
    if (base64.length > UPCOMING_MEDIA_MAX_BASE64_LENGTH) {
      return { ok: false, errorCode: 'media-too-large' };
    }
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.byteLength > UPCOMING_MEDIA_MAX_BYTES)
      return { ok: false, errorCode: 'media-too-large' };
    if (bytes.byteLength === 0 || bytes.toString('base64') !== base64) {
      return { ok: false, errorCode: 'media-invalid-base64' };
    }
    if (probeUpcomingMedia(bytes) !== mime) return { ok: false, errorCode: 'media-type-mismatch' };
    const sha256 = hash(bytes);
    try {
      await this.#mutate(async () => {
        if (this.directory === null) {
          this.#memory.set(sha256, { bytes, mime });
        } else if ((await this.read(sha256)) === null) {
          await mkdir(this.directory, { recursive: true });
          const file = path.join(this.directory, sha256);
          const temporary = `${file}.${randomUUID()}.tmp`;
          try {
            const staging = await open(temporary, 'wx', 0o600);
            try {
              await staging.writeFile(Buffer.from([MIME_TAG[mime]]));
              await staging.writeFile(bytes);
            } finally {
              await staging.close();
            }
            await rename(temporary, file);
          } finally {
            await unlink(temporary).catch(() => undefined);
          }
        }
        this.#recentUses.set(sha256, Date.now());
      });
      return { ok: true, sha256, mime };
    } catch {
      return { ok: false, errorCode: 'media-store-failed' };
    }
  }

  async get({ sha256 }: UpcomingMediaGetRequest): Promise<UpcomingMediaGetResult> {
    const media = await this.read(sha256);
    return media === null
      ? { kind: 'missing' }
      : { kind: 'media', mime: media.mime, base64: media.bytes.toString('base64') };
  }

  async remove(
    { sha256 }: UpcomingMediaRemoveRequest,
    inUse: () => boolean,
  ): Promise<UpcomingMediaRemoveResult> {
    if (!MEDIA_HASH.test(sha256)) {
      return { removed: false, errorCode: 'upcoming-program-media-remove-failed' };
    }
    try {
      return await this.#mutate<UpcomingMediaRemoveResult>(async () => {
        if (inUse()) return { removed: false, errorCode: 'upcoming-program-media-in-use' };
        await this.#delete(sha256);
        return { removed: true };
      });
    } catch {
      return { removed: false, errorCode: 'upcoming-program-media-remove-failed' };
    }
  }

  async read(sha256: string): Promise<StoredUpcomingMedia | null> {
    if (!MEDIA_HASH.test(sha256)) return null;
    if (this.directory === null) {
      const media = this.#memory.get(sha256);
      return media === undefined ? null : { bytes: Buffer.from(media.bytes), mime: media.mime };
    }
    return this.#readObject(sha256, async (file, mime) => {
      const bytes = await file.readFile();
      return probeUpcomingMedia(bytes) === mime && hash(bytes) === sha256 ? { bytes, mime } : null;
    });
  }

  /** Check the media type without loading its payload, and protect an in-flight row prepare. */
  mimeOf(sha256: string): Promise<UpcomingMediaMime | null> {
    if (!MEDIA_HASH.test(sha256)) return Promise.resolve(null);
    return this.#mutate(async () => {
      const mime =
        this.directory === null
          ? (this.#memory.get(sha256)?.mime ?? null)
          : await this.#readObject(sha256, (_file, type) => Promise.resolve(type));
      if (mime !== null) this.#recentUses.set(sha256, Date.now());
      return mime;
    });
  }

  async #readObject<T>(
    sha256: string,
    read: (file: FileHandle, mime: UpcomingMediaMime) => Promise<T | null>,
  ): Promise<T | null> {
    if (this.directory === null) return null;
    try {
      const file = await open(path.join(this.directory, sha256), 'r');
      try {
        const details = await file.stat();
        if (!details.isFile() || details.size < 2 || details.size > UPCOMING_MEDIA_MAX_BYTES + 1) {
          return null;
        }
        const tag = Buffer.alloc(1);
        const { bytesRead } = await file.read(tag, 0, 1, null);
        const mime = MIME_FROM_TAG.get(tag[0] ?? -1);
        return bytesRead === 1 && mime !== undefined ? await read(file, mime) : null;
      } finally {
        await file.close();
      }
    } catch {
      return null;
    }
  }

  /** A newly uploaded or validated file gets time to be associated with a stack row. */
  sweep(
    keep: ReadonlySet<string> | ((sha256: string) => boolean),
    now = Date.now(),
    graceMs = UPLOAD_GRACE_MS,
  ): Promise<number> {
    return this.#mutate(async () => {
      const directory = this.directory;
      const hashes =
        directory === null
          ? [...this.#memory.keys()]
          : await readdir(directory).catch((error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') return [];
              throw error;
            });
      let removed = 0;
      for (const sha256 of hashes) {
        if (!MEDIA_HASH.test(sha256)) continue;
        const lastUse = this.#recentUses.get(sha256);
        if (lastUse !== undefined && now - lastUse < graceMs) continue;
        if (typeof keep === 'function' ? keep(sha256) : keep.has(sha256)) continue;
        await this.#delete(sha256);
        removed += 1;
      }
      return removed;
    });
  }

  async #delete(sha256: string): Promise<void> {
    if (this.directory === null) {
      this.#memory.delete(sha256);
    } else {
      await unlink(path.join(this.directory, sha256)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    this.#recentUses.delete(sha256);
  }

  #mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pendingMutation.then(operation);
    this.#pendingMutation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
