import type { Workspace, WorkspaceEntry } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalize(path: string): string {
  return path
    .split('/')
    .filter((s) => s.length > 0)
    .join('/');
}

/**
 * In-memory Workspace. Used in tests and as a last-resort fallback when no
 * persistent backend is available. Holds bytes in a Map; nothing survives a
 * reload.
 */
export class MemoryWorkspace implements Workspace {
  readonly label = 'memory';
  readonly #files = new Map<string, Uint8Array>();

  // eslint-disable-next-line @typescript-eslint/require-await
  async readFile(path: string): Promise<Uint8Array | null> {
    return this.#files.get(normalize(path)) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.#files.set(normalize(path), data.slice());
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(path: string): Promise<void> {
    this.#files.delete(normalize(path));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async exists(path: string): Promise<boolean> {
    return this.#files.has(normalize(path));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async list(dir = ''): Promise<WorkspaceEntry[]> {
    const prefix = normalize(dir);
    const base = prefix.length > 0 ? `${prefix}/` : '';
    const files = new Set<string>();
    const dirs = new Set<string>();
    for (const key of this.#files.keys()) {
      if (!key.startsWith(base)) continue;
      const rest = key.slice(base.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        files.add(rest);
      } else {
        dirs.add(rest.slice(0, slash));
      }
    }
    const out: WorkspaceEntry[] = [];
    for (const name of dirs) out.push({ name, path: `${base}${name}`, kind: 'directory' });
    for (const name of files) out.push({ name, path: `${base}${name}`, kind: 'file' });
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
  }
}
