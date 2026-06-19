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

// D-088 — per-project FILE handles (the project's `.cg.json` on disk). Keyed in the
// SAME object store as directory handles but namespaced so the two never collide.
// FileSystemFileHandle is structured-cloneable exactly like a directory handle, so it
// is stored directly; permission re-acquisition is still the caller's job (gesture).
const FILE_KEY_PREFIX = 'project-file:';

export async function saveFileHandle(
  projectId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  await tx('readwrite', (store) => store.put(handle, FILE_KEY_PREFIX + projectId));
}

export async function loadFileHandle(projectId: string): Promise<FileSystemFileHandle | null> {
  const result = await tx<unknown>('readonly', (store) => store.get(FILE_KEY_PREFIX + projectId));
  return (result as FileSystemFileHandle | undefined) ?? null;
}

export async function forgetFileHandle(projectId: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(FILE_KEY_PREFIX + projectId));
}

/** A handle that may carry the File System Access permission methods (file OR directory). */
type PermissionedHandle = FileSystemHandle & {
  queryPermission?: (d: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (d: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
};

/**
 * Re-acquire read/write permission for a previously stored handle (file or directory).
 * Browsers drop the permission grant between sessions; this re-prompts (or silently
 * succeeds if already granted). MUST be called from a user gesture when a prompt is
 * possible. Returns true when usable.
 */
export async function ensureHandlePermission(handle: PermissionedHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  // OPFS handles have no permission gate; treat the absence of the methods
  // as "already usable".
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}
