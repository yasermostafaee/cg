import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SHARED_TEMPLATE_THUMBNAIL_MAX_BYTES } from '@cg/shared-ipc';
import { isPreviewPng } from './shared-template-thumbnail.js';

const VERSION_BYTES = 16;

/** One small preview per channel and template, independently of the air page and kept VCG. */
export class CatalogueThumbnailStore {
  readonly #volatile = new Map<string, Buffer>();
  readonly #directory: string | null;

  constructor(persistDir: string | null) {
    this.#directory = persistDir === null ? null : path.join(persistDir, 'template-thumbnails');
  }

  #name(channel: number, templateId: string): string {
    const hash = createHash('sha256').update(templateId).digest('hex');
    return `${String(channel)}-${hash}.bin`;
  }

  #read(name: string): Buffer | null {
    const volatile = this.#volatile.get(name);
    if (volatile !== undefined) return volatile;
    if (this.#directory === null) return null;
    const file = path.join(this.#directory, name);
    try {
      if (!fs.lstatSync(file).isFile()) return null;
      const fd = fs.openSync(
        file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0),
      );
      try {
        const info = fs.fstatSync(fd);
        if (
          !info.isFile() ||
          info.size <= VERSION_BYTES ||
          info.size > VERSION_BYTES + SHARED_TEMPLATE_THUMBNAIL_MAX_BYTES
        ) {
          return null;
        }
        const bytes = Buffer.alloc(info.size);
        let offset = 0;
        while (offset < bytes.length) {
          const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
          if (read === 0) return null;
          offset += read;
        }
        return bytes;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return null;
    }
  }

  get(channel: number, templateId: string, versionId: string): Buffer | null {
    const kept = this.#read(this.#name(channel, templateId));
    if (kept === null || kept.toString('ascii', 0, VERSION_BYTES) !== versionId) return null;
    const png = kept.subarray(VERSION_BYTES);
    return isPreviewPng(png) ? png : null;
  }

  /** Return true only when the pictured bytes or the version changes. */
  put(channel: number, templateId: string, versionId: string, png: Buffer): boolean {
    const name = this.#name(channel, templateId);
    const bytes = Buffer.concat([Buffer.from(versionId, 'ascii'), png]);
    if (this.#read(name)?.equals(bytes) === true) return false;
    if (this.#directory !== null) {
      const file = path.join(this.#directory, name);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        fs.mkdirSync(this.#directory, { recursive: true });
        fs.writeFileSync(temporary, bytes, { flag: 'wx' });
        fs.renameSync(temporary, file);
        this.#volatile.delete(name);
        return true;
      } catch {
        try {
          fs.rmSync(temporary, { force: true });
        } catch {
          // The temporary file is never used as a preview.
        }
      }
    }
    this.#volatile.set(name, bytes);
    return true;
  }

  remove(channel: number, templateId: string): void {
    const name = this.#name(channel, templateId);
    this.#volatile.delete(name);
    if (this.#directory === null) return;
    try {
      fs.rmSync(path.join(this.#directory, name), { force: true });
    } catch {
      // A stale preview is ignored unless its exact template version is listed again.
    }
  }
}
