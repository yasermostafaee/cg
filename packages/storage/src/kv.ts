import type { KeyValueStore } from './types.js';

/**
 * localStorage-backed KV with a key namespace. Values are JSON-serialized.
 * Reads never throw: malformed or missing entries resolve to `null`.
 */
export class LocalStorageKv implements KeyValueStore {
  readonly #prefix: string;

  constructor(namespace: string) {
    this.#prefix = `${namespace}:`;
  }

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.#prefix + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown): void {
    localStorage.setItem(this.#prefix + key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(this.#prefix + key);
  }
}

/** In-memory KV for tests and non-browser contexts. */
export class MemoryKv implements KeyValueStore {
  readonly #map = new Map<string, string>();

  get<T>(key: string): T | null {
    const raw = this.#map.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }

  set(key: string, value: unknown): void {
    this.#map.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.#map.delete(key);
  }
}
