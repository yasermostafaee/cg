import type { FieldPath, StackPruneInput } from './draftStore.js';
import {
  attachmentKey,
  deleteAttachment,
  loadAttachments,
  pruneAttachments,
  saveAttachment,
} from './fromFilePersistence.js';
import { fieldPathKey } from './listFieldTargets.js';
import {
  fsaTextFileSource,
  queryReadPermission,
  type FileSourcePermission,
  type TextFileSource,
} from './textFileSource.js';

/**
 * R-018 — the per-item, per-field "from file" state: the attached source, the
 * split configuration, and the last reload error. A module store + version
 * counter + subscribe (the `draftStore` shape) so the pure attach/flag logic is
 * node-testable and the components consume it through `useSyncExternalStore`.
 *
 * B-113 — no longer session-local. Every mutation writes through to IndexedDB
 * (`fromFilePersistence`) and `restoreFromFileAttachments()` reads them back at
 * boot, so an attachment survives a page refresh. The store stays the single
 * source of truth for the UI; persistence is a mirror behind it, and a failure
 * to write costs durability, never the attachment itself.
 */
export interface FromFileState {
  source: TextFileSource;
  /** Split the content into list items (list fields only; default per-target). */
  split: boolean;
  /** Delimiter as typed (escapes unparsed — `parseDelimiter` resolves at use). */
  delimiter: string;
  /** The last reload's error, or null. Cleared by the next successful read. */
  error: string | null;
  /**
   * B-113 — whether this source can be READ right now. A freshly picked file is
   * always `granted` (the picker IS the grant); one restored from a previous
   * session may need the operator to re-grant, and until they do the control
   * must say so rather than present an unreadable file as attached.
   */
  permission: FileSourcePermission;
}

const entries = new Map<string, FromFileState>();
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  for (const l of [...listeners]) l();
}

function keyOf(itemId: string, path: FieldPath): string {
  return attachmentKey(itemId, path);
}

/**
 * Mirror one field's entry to durable storage. Fire-and-forget by design: the
 * store has already changed and the UI has already rendered it, so awaiting the
 * write would only make an attach feel slow, and a rejected write must not undo
 * an attachment the operator can see.
 */
function persist(itemId: string, path: FieldPath, entry: FromFileState): void {
  const handle = entry.source.handle;
  // No handle means nothing durable to write (the test fake, and any future
  // non-FSA source). Not an error — just not persistable.
  if (handle === undefined) return;
  void saveAttachment({
    key: keyOf(itemId, path),
    itemId,
    path,
    handle,
    split: entry.split,
    delimiter: entry.delimiter,
  });
}

/** Subscribe to from-file state changes (for `useSyncExternalStore`). Returns unsubscribe. */
export function subscribeFromFile(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic version — the `useSyncExternalStore` snapshot. */
export function fromFileVersion(): number {
  return version;
}

/** The field's from-file state, or undefined when no source is attached. */
export function fromFileState(itemId: string, path: FieldPath): FromFileState | undefined {
  return entries.get(keyOf(itemId, path));
}

/** Attach a source to a field (replacing any previous one), with its split defaults. */
export function attachFileSource(
  itemId: string,
  path: FieldPath,
  source: TextFileSource,
  defaults: { split: boolean; delimiter: string },
): void {
  // A freshly picked file is readable by construction — the picker IS the grant.
  const entry: FromFileState = {
    source,
    split: defaults.split,
    delimiter: defaults.delimiter,
    error: null,
    permission: 'granted',
  };
  entries.set(keyOf(itemId, path), entry);
  persist(itemId, path, entry);
  bump();
}

/** Detach the field's source (the field goes back to hand editing only). */
export function detachFileSource(itemId: string, path: FieldPath): void {
  const key = keyOf(itemId, path);
  if (entries.delete(key)) {
    void deleteAttachment(key);
    bump();
  }
}

/**
 * B-113 — record the outcome of a permission re-grant on a restored source.
 * Not persisted: permission is the browser's to remember, and writing our guess
 * of it would make a stale copy that outlives the truth.
 */
export function setFromFilePermission(
  itemId: string,
  path: FieldPath,
  permission: FileSourcePermission,
): void {
  const key = keyOf(itemId, path);
  const entry = entries.get(key);
  if (entry === undefined) return;
  entries.set(key, { ...entry, permission, ...(permission === 'granted' ? { error: null } : {}) });
  bump();
}

/** Update the split flag / delimiter of an attached source. No-op when none attached. */
export function updateSplitConfig(
  itemId: string,
  path: FieldPath,
  patch: Partial<Pick<FromFileState, 'split' | 'delimiter'>>,
): void {
  const key = keyOf(itemId, path);
  const entry = entries.get(key);
  if (entry === undefined) return;
  const next = { ...entry, ...patch };
  entries.set(key, next);
  // The split flag and the delimiter are part of what "this field's source"
  // means, so they persist with it — a refresh that restored the file but not
  // the delimiter would silently change how the file is read.
  persist(itemId, path, next);
  bump();
}

/** Record (or clear, with null) the field's last reload error. No-op when none attached. */
export function setFromFileError(itemId: string, path: FieldPath, error: string | null): void {
  const key = keyOf(itemId, path);
  const entry = entries.get(key);
  if (entry === undefined) return;
  entries.set(key, { ...entry, error });
  bump();
}

/**
 * TEXT-FILE-OPT-01 — what one item's template says about file-source grants.
 *
 * 🔴 THE `known: false` ARM IS THE POINT OF THIS TYPE, and it is modelled on
 * {@link StackPruneInput} for exactly the reason that one exists.
 * {@link detachUngrantedSources} DELETES from durable storage, and the fact it
 * deletes on — "this field was not granted" — is indistinguishable, at a glance,
 * from "we do not yet know what this field was granted". The Inspector starts
 * `info` at `null` and fills it from an async `templates.get`, so the unknown state
 * is not an edge case: it is the state on EVERY selection change, for EVERY field,
 * and for the whole life of a template the registry cannot resolve.
 *
 * Making the caller produce a discriminated snapshot means the mistake cannot be
 * made by forgetting a guard — there is no shape in which "I have no schema" and
 * "the schema grants nothing" are the same value. Golden rule 8, one axis over:
 * silence on the schema channel is evidence that the answer is UNAVAILABLE, never
 * evidence that the answer is "no".
 */
export type FieldGrantSnapshot =
  | { readonly known: false }
  | {
      readonly known: true;
      readonly itemId: string;
      /** `fieldPathKey(path)` for every field this item's template GRANTS. */
      readonly grantedPaths: ReadonlySet<string>;
    };

/**
 * TEXT-FILE-OPT-01 — detach any attachment on a field this item's template does NOT
 * grant a file source, from the live store AND from durable storage.
 *
 * This is the answer to "what happens to a field that already has a file attached
 * when the author turns the grant off?". The alternative — keep the attachment and
 * hide the control — is content arriving from a source with no visible cause, and it
 * is worse than it looks: `restoreFromFileAttachments` would keep restoring it every
 * boot, so re-granting the field later would hand the operator a control pre-armed
 * with a file they attached and forgot. Detaching ends both.
 *
 * Scoped to ONE item because the grant is a fact about ONE template, and the caller
 * (the Inspector) only ever holds one item's resolved schema at a time. Entries for
 * every other item are left untouched — items are pruned by `pruneFromFile`, on the
 * stack snapshot, which is a different question with a different input.
 */
export function detachUngrantedSources(snapshot: FieldGrantSnapshot): void {
  if (!snapshot.known) return;
  let changed = false;
  for (const key of [...entries.keys()]) {
    // Same decode as `pruneFromFile`: the key IS `[itemId, ...path]` (`attachmentKey`).
    const [entryItemId, ...path] = JSON.parse(key) as [string, ...string[]];
    if (entryItemId !== snapshot.itemId) continue;
    if (snapshot.grantedPaths.has(fieldPathKey(path))) continue;
    entries.delete(key);
    void deleteAttachment(key);
    changed = true;
  }
  if (changed) bump();
}

/**
 * Drop entries for items no longer on the stack (wired beside `pruneDrafts`).
 *
 * Takes the same {@link StackPruneInput} and fails closed for the same reason: it
 * rides the SAME pass, so it lost file attachments on exactly the remounts that
 * lost the drafts. A different store and a different loss, one mechanism.
 */
export function pruneFromFile(snapshot: StackPruneInput): void {
  if (!snapshot.ready) return;
  const live = snapshot.liveItemIds;
  let changed = false;
  for (const key of [...entries.keys()]) {
    const [itemId] = JSON.parse(key) as [string, ...string[]];
    if (!live.has(itemId)) {
      entries.delete(key);
      changed = true;
    }
  }
  if (changed) bump();
}

/**
 * B-113 — restore attachments persisted by a previous session.
 *
 * Called once the stack is known, and given the ids that are actually on it:
 * restoring blind would resurrect attachments for items that are gone, and
 * prune them a moment later — a flicker of file names on rows that do not have
 * them. Anything not in `liveItemIds` is dropped from durable storage in the
 * same pass, so a profile cannot accumulate handles forever.
 *
 * An already-attached field is left ALONE: the live session's attachment is the
 * operator's most recent intent, and a restore arriving late must never
 * overwrite a file they just picked.
 *
 * TAKES {@link StackPruneInput}, NOT A BARE ID LIST, because the `pruneAttachments`
 * below deletes from DURABLE storage. Driven by the bootstrap snapshot it would
 * have wiped every persisted attachment in the profile — the same mechanism as the
 * draft loss but a strictly worse blast radius, since that one survives a reload.
 * It was reachable only because this ran in the same pass as the prunes; the type
 * now makes it unreachable rather than merely un-called.
 */
export async function restoreFromFileAttachments(snapshot: StackPruneInput): Promise<void> {
  if (!snapshot.ready) return;
  const live = snapshot.liveItemIds;
  const records = await loadAttachments();
  let changed = false;
  for (const record of records) {
    if (!live.has(record.itemId)) continue;
    if (entries.has(record.key)) continue;
    // Asked, never prompted: `queryPermission` cannot show a dialog, so this is
    // safe during boot. Where it comes back short of granted the entry is still
    // restored — the operator sees WHICH file was attached and is offered the
    // gesture — but it is marked unreadable so nothing reads stale content.
    const permission = await queryReadPermission(record.handle);
    entries.set(record.key, {
      source: fsaTextFileSource(record.handle),
      split: record.split,
      delimiter: record.delimiter,
      error: null,
      permission,
    });
    changed = true;
  }
  void pruneAttachments(live);
  if (changed) bump();
}

/** Test-only: wipe all entries. */
export function __resetFromFileForTest(): void {
  entries.clear();
  bump();
}
