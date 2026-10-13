/**
 * An in-memory `localStorage` for jsdom specs that need to READ BACK what the app persists.
 *
 * The suite's jsdom runs on an opaque origin, where `window.localStorage` is absent — the
 * shell-layout hook already tolerates that (`globalThis.localStorage?.…`), which is exactly
 * why a spec asserting "nothing new was persisted" cannot rely on the real thing being there:
 * an absent store makes every such assertion vacuously true. This stands one in, per test.
 */
export function installMemoryStorage(): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return storage;
}
