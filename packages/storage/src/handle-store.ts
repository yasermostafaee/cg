// Persist `FileSystemDirectoryHandle`s in IndexedDB so a picked folder can
// be re-opened on the next visit without prompting again. Handles are
// structured-cloneable, so IndexedDB stores them directly. Re-acquiring
// permission (`requestPermission`) is still the caller's responsibility.

const DB_NAME = 'cg-storage';
const STORE = 'handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export async function saveDirectoryHandle(
  id: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await tx('readwrite', (store) => store.put(handle, id));
}

export async function loadDirectoryHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  const result = await tx<unknown>('readonly', (store) => store.get(id));
  return (result as FileSystemDirectoryHandle | undefined) ?? null;
}

export async function forgetDirectoryHandle(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
}

/**
 * Re-acquire read/write permission for a previously stored handle. Browsers
 * drop the permission grant between sessions; this re-prompts (or silently
 * succeeds if already granted). Returns true when usable.
 */
export async function ensureHandlePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  // OPFS handles have no permission gate; treat the absence of the methods
  // as "already usable".
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}
