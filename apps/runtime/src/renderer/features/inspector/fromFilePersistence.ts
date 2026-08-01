/**
 * B-113 — the durable half of a field's file attachment.
 *
 * WHY INDEXEDDB AND NOT `localStorage`. A `FileSystemFileHandle` is opaque: it
 * cannot be serialised to a string, so `localStorage` — the store every other
 * browser-local preference here uses — physically cannot hold one. IndexedDB
 * can, because it stores STRUCTURED CLONES, and a handle is cloneable. That is
 * the whole reason this file exists rather than one more `localStorage` key.
 *
 * WHY THE KEY IS DURABLE NOW. R-018's design.md justified skipping persistence
 * with "item ids are minted per load, so after a tab reload there is no durable
 * identity to re-attach to". That was true when it was written and is not any
 * more: B-092 added `StackRetentionStore`, which persists each item's `itemId`
 * and re-delivers it on connect, so `itemId + fieldPath` survives a reload and
 * names the same field afterwards. The stale rationale is corrected in that
 * design doc rather than left to mislead the next reader.
 *
 * WHAT IS DELIBERATELY NOT PERSISTED: the last read ERROR. An error describes
 * one read attempt against one moment's filesystem; restoring it would present
 * a stale failure as the file's current condition, and the operator would be
 * looking at a red line about a share that came back ten minutes ago.
 */
import type { FieldPath } from './draftStore.js';

const DB_NAME = 'cg-runtime-from-file';
const DB_VERSION = 1;
const STORE = 'attachments';

/** What is written per field. The handle is the only part that needs IndexedDB. */
export interface PersistedAttachment {
  key: string;
  itemId: string;
  path: FieldPath;
  handle: FileSystemFileHandle;
  split: boolean;
  delimiter: string;
}

export function attachmentKey(itemId: string, path: FieldPath): string {
  return JSON.stringify([itemId, ...path]);
}

/**
 * Open (and if needed create) the database.
 *
 * Every failure resolves `null` rather than rejecting: IndexedDB is unavailable
 * in a surprising number of real conditions (private windows, blocked
 * third-party storage, a corrupt profile), and NONE of them should stop an
 * operator attaching a file. Losing persistence degrades this feature to
 * exactly what it was before B-113; throwing would take the feature away.
 */
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

function runWrite(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
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

/** Write (or overwrite) one field's attachment. Silent on failure — see `openDb`. */
export async function saveAttachment(record: PersistedAttachment): Promise<void> {
  const db = await openDb();
  if (db === null) return;
  await runWrite(db, (store) => store.put(record));
  db.close();
}

/** Forget one field's attachment. */
export async function deleteAttachment(key: string): Promise<void> {
  const db = await openDb();
  if (db === null) return;
  await runWrite(db, (store) => store.delete(key));
  db.close();
}

/** Every persisted attachment. Empty when storage is unavailable. */
export async function loadAttachments(): Promise<PersistedAttachment[]> {
  const db = await openDb();
  if (db === null) return [];
  const records = await new Promise<PersistedAttachment[]>((resolve) => {
    let request: IDBRequest<unknown[]>;
    try {
      request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    } catch {
      resolve([]);
      return;
    }
    request.onsuccess = () => resolve(request.result as PersistedAttachment[]);
    request.onerror = () => resolve([]);
  });
  db.close();
  return records;
}

/**
 * Drop persisted attachments whose item is no longer on the stack.
 *
 * The mirror of `pruneFromFile`. Without it, a removed item's handle would sit
 * in IndexedDB for the life of the profile and be restored onto an item id that
 * a future session might mint again — an attachment nobody asked for, on a
 * field nobody attached it to.
 */
export async function pruneAttachments(liveItemIds: Iterable<string>): Promise<void> {
  const live = new Set(liveItemIds);
  const records = await loadAttachments();
  const dead = records.filter((r) => !live.has(r.itemId));
  if (dead.length === 0) return;
  const db = await openDb();
  if (db === null) return;
  await runWrite(db, (store) => {
    for (const r of dead) store.delete(r.key);
  });
  db.close();
}
