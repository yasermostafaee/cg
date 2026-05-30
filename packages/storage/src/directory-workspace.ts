import type { Workspace, WorkspaceEntry } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError';
}

/**
 * Workspace backed by a `FileSystemDirectoryHandle`. The same handle type
 * is produced by `showDirectoryPicker()` (a real on-disk folder, File
 * System Access API) and by `navigator.storage.getDirectory()` (OPFS), so
 * this one implementation covers both backends.
 */
export class DirectoryWorkspace implements Workspace {
  readonly label: string;
  readonly #root: FileSystemDirectoryHandle;

  constructor(root: FileSystemDirectoryHandle, label?: string) {
    this.#root = root;
    this.label = label ?? root.name;
  }

  async #resolveDir(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.#root;
    for (const segment of segments) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create });
      } catch (err) {
        if (!create && isNotFound(err)) return null;
        throw err;
      }
    }
    return dir;
  }

  async #fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const segments = splitPath(path);
    const name = segments.pop();
    if (name === undefined) throw new Error(`Invalid file path: '${path}'`);
    const dir = await this.#resolveDir(segments, create);
    if (dir === null) return null;
    try {
      return await dir.getFileHandle(name, { create });
    } catch (err) {
      if (!create && isNotFound(err)) return null;
      throw err;
    }
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const handle = await this.#fileHandle(path, false);
    if (handle === null) return null;
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const handle = await this.#fileHandle(path, true);
    if (handle === null) throw new Error(`Could not create file: '${path}'`);
    const writable = await handle.createWritable();
    // `data` may be a Uint8Array view over a larger buffer; copy to an exact
    // ArrayBuffer so the writable receives only the intended bytes.
    await writable.write(data.slice());
    await writable.close();
  }

  async readText(path: string): Promise<string | null> {
    const bytes = await this.readFile(path);
    return bytes === null ? null : decoder.decode(bytes);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeFile(path, encoder.encode(text));
  }

  async readJson<T>(path: string): Promise<T | null> {
    const text = await this.readText(path);
    return text === null ? null : (JSON.parse(text) as T);
  }

  async writeJson(path: string, value: unknown): Promise<void> {
    await this.writeText(path, JSON.stringify(value, null, 2));
  }

  async delete(path: string): Promise<void> {
    const segments = splitPath(path);
    const name = segments.pop();
    if (name === undefined) return;
    const dir = await this.#resolveDir(segments, false);
    if (dir === null) return;
    try {
      await dir.removeEntry(name);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.#fileHandle(path, false)) !== null;
  }

  async list(dir = ''): Promise<WorkspaceEntry[]> {
    const handle = await this.#resolveDir(splitPath(dir), false);
    if (handle === null) return [];
    const out: WorkspaceEntry[] = [];
    const prefix = dir.length > 0 ? `${dir.replace(/\/$/, '')}/` : '';
    for await (const [name, child] of handle.entries()) {
      out.push({ name, path: `${prefix}${name}`, kind: child.kind });
    }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
  }
}
