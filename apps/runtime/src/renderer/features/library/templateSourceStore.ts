/**
 * R-108 — the original `.vcg` behind an imported template.
 *
 * A browser `File` is only one snapshot and carries no re-openable path. A
 * `FileSystemFileHandle` is the durable capability Chromium gives us instead: it keeps pointing at
 * the same local/UNC file and is structured-cloneable, so IndexedDB can retain it across CG Control
 * restarts. The handle is browser-local by design; the central template catalogue stays on CG
 * Bridge, while each operator station remembers only paths it can actually reach.
 */

const DB_NAME = 'cg-runtime-template-sources';
const DB_VERSION = 1;
const STORE = 'sources';

export interface TemplateSourceRecord {
  key: string;
  templateId: string;
  channel: number | null;
  handle: FileSystemFileHandle;
}

export function templateSourceKey(templateId: string, channel?: number): string {
  return JSON.stringify([channel ?? null, templateId]);
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function write(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch {
      resolve();
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
    run(tx.objectStore(STORE));
  });
}

/** Remember the source selected for this channel's template. Storage failure never breaks import. */
export async function saveTemplateSource(
  templateId: string,
  channel: number | undefined,
  handle: FileSystemFileHandle,
): Promise<void> {
  const db = await openDb();
  if (db === null) return;
  await write(db, (store) =>
    store.put({
      key: templateSourceKey(templateId, channel),
      templateId,
      channel: channel ?? null,
      handle,
    } satisfies TemplateSourceRecord),
  );
  db.close();
}

export async function deleteTemplateSource(templateId: string, channel?: number): Promise<void> {
  const db = await openDb();
  if (db === null) return;
  await write(db, (store) => store.delete(templateSourceKey(templateId, channel)));
  db.close();
}

/** Every remembered source; malformed/old records are ignored at the read boundary. */
export async function loadTemplateSources(): Promise<TemplateSourceRecord[]> {
  const db = await openDb();
  if (db === null) return [];
  const records = await new Promise<TemplateSourceRecord[]>((resolve) => {
    let request: IDBRequest<unknown[]>;
    try {
      request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    } catch {
      resolve([]);
      return;
    }
    request.onsuccess = () => {
      const valid = request.result.filter((record): record is TemplateSourceRecord => {
        if (record === null || typeof record !== 'object') return false;
        const value = record as Partial<TemplateSourceRecord>;
        return (
          typeof value.key === 'string' &&
          typeof value.templateId === 'string' &&
          (value.channel === null || typeof value.channel === 'number') &&
          value.handle?.kind === 'file'
        );
      });
      resolve(valid);
    };
    request.onerror = () => resolve([]);
  });
  db.close();
  return records;
}

interface TemplatePickerWindow {
  showOpenFilePicker?: (options?: {
    types?: { description?: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

export interface PickedTemplatePackage {
  file: File;
  handle?: FileSystemFileHandle;
}

/** True when the chooser can return a handle that makes later Reload possible. */
export function templateSourcePickerSupported(w: Window = window): boolean {
  return typeof (w as TemplatePickerWindow).showOpenFilePicker === 'function';
}

/** Pick one package and keep its handle. `null` is the operator cancelling the OS chooser. */
export async function pickTemplatePackage(
  w: Window = window,
): Promise<PickedTemplatePackage | null> {
  const picker = (w as TemplatePickerWindow).showOpenFilePicker;
  if (picker === undefined) return null;
  let handles: FileSystemFileHandle[];
  try {
    handles = await picker({
      types: [
        {
          description: 'CG template package',
          accept: { 'application/octet-stream': ['.vcg'] },
        },
      ],
      excludeAcceptAllOption: true,
      multiple: false,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  const handle = handles[0];
  if (handle === undefined) return null;
  return { file: await handle.getFile(), handle };
}

type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
};

/** Re-acquire read permission from a Reload button's user gesture. */
export async function ensureTemplateSourcePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const permission = handle as PermissionHandle;
  if (permission.queryPermission === undefined || permission.requestPermission === undefined) {
    return true;
  }
  try {
    if ((await permission.queryPermission({ mode: 'read' })) === 'granted') return true;
    return (await permission.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}
