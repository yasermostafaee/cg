import type { FieldPath } from './draftStore.js';
import type { TextFileSource } from './textFileSource.js';

/**
 * R-018 — the per-item, per-field "from file" state: the attached source, the
 * split configuration, and the last reload error. A module store + version
 * counter + subscribe (the `draftStore` shape) so the pure attach/flag logic is
 * node-testable and the components consume it through `useSyncExternalStore`.
 *
 * SESSION-LOCAL BY DESIGN: an FSA handle could be persisted to IndexedDB, but
 * a stack item's id does not survive the page session, so there is nothing
 * durable to re-attach the handle TO — and re-reading a handle in a new
 * session needs a user-gesture permission re-grant anyway. The operator
 * re-picks the file after a tab reload; design.md records the trade-off.
 */
export interface FromFileState {
  source: TextFileSource;
  /** Split the content into list items (list fields only; default per-target). */
  split: boolean;
  /** Delimiter as typed (escapes unparsed — `parseDelimiter` resolves at use). */
  delimiter: string;
  /** The last reload's error, or null. Cleared by the next successful read. */
  error: string | null;
}

const entries = new Map<string, FromFileState>();
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  for (const l of [...listeners]) l();
}

function keyOf(itemId: string, path: FieldPath): string {
  return JSON.stringify([itemId, ...path]);
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
  entries.set(keyOf(itemId, path), {
    source,
    split: defaults.split,
    delimiter: defaults.delimiter,
    error: null,
  });
  bump();
}

/** Detach the field's source (the field goes back to hand editing only). */
export function detachFileSource(itemId: string, path: FieldPath): void {
  if (entries.delete(keyOf(itemId, path))) bump();
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
  entries.set(key, { ...entry, ...patch });
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

/** Drop entries for items no longer on the stack (wired beside `pruneDrafts`). */
export function pruneFromFile(liveItemIds: Iterable<string>): void {
  const live = new Set(liveItemIds);
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

/** Test-only: wipe all entries. */
export function __resetFromFileForTest(): void {
  entries.clear();
  bump();
}
