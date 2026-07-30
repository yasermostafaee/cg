import { isFieldNamespace, type FieldValue, type FieldValues } from '@cg/shared-schema';

/**
 * R-003 — the Inspector's per-item DRAFT overlay. Edits stage here (renderer-
 * local session state) and never touch the bridge; the stack row's Update
 * button applies a draft as ONE atomic `stack.update`. This is deliberately
 * framework-free (a module store + version counter + subscribe) so the pure
 * staging logic is node-testable and the components consume it through
 * `useSyncExternalStore`.
 *
 * A draft is a partial field-set: only the fields the operator touched. The
 * applied truth stays the Reconciler's `StackItemState.fields` (pushed over
 * `stack.state-changed`); a field renders draft-or-applied, so an incoming push
 * updates un-staged fields live while staged fields keep their draft (no
 * clobber — the recorded R-003 hazard).
 *
 * B-067 — a field is now addressed by a PATH, not a bare id: a nested composition's
 * fields live under that instance's namespace (`['زیرنویس', 'name']`), which is the same
 * address the GDD advertises and `@cg/template-runtime` resolves at render. A top-level
 * field is just a path of length 1, so flat templates behave exactly as before.
 */

/** Address of one editable field: the namespace chain, then the field id. */
export type FieldPath = readonly string[];

const drafts = new Map<string, FieldValues>();
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  for (const l of [...listeners]) l();
}

/** Subscribe to draft changes (for `useSyncExternalStore`). Returns unsubscribe. */
export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic version — the `useSyncExternalStore` snapshot. */
export function draftsVersion(): number {
  return version;
}

/** The value at `path`, or undefined when the path doesn't resolve to a leaf value. */
export function valueAt(values: FieldValues | undefined, path: FieldPath): FieldValue | undefined {
  // `unknown` cursor: an image value `{ assetId }` is structurally assignable to the
  // namespace type, so narrowing a `FieldValue | FieldValues` union keeps it in play and
  // the index is rejected. Walking from `unknown` lets the guard narrow cleanly.
  let node: unknown = values;
  for (const key of path) {
    if (!isFieldNamespace(node)) return undefined;
    node = node[key];
  }
  return isFieldNamespace(node) ? undefined : (node as FieldValue | undefined);
}

/** True iff `path` has a staged draft value. */
function hasDraftAt(values: FieldValues | undefined, path: FieldPath): boolean {
  let node: unknown = values;
  for (const key of path) {
    if (!isFieldNamespace(node) || !(key in node)) return false;
    node = node[key];
  }
  return true;
}

/** Set `value` at `path`, creating the intermediate namespaces. Mutates `root`. */
function setAt(root: FieldValues, path: FieldPath, value: FieldValue): void {
  let node = root;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (!isFieldNamespace(next)) node[key] = {};
    node = node[key] as FieldValues;
  }
  node[path[path.length - 1]!] = value;
}

/**
 * Deep-merge `overlay` onto `base`. Namespaces merge recursively; a leaf value REPLACES.
 * (Shallow spread would drop a namespace's un-staged siblings.)
 */
function deepMerge(base: FieldValues, overlay: FieldValues): FieldValues {
  const out: FieldValues = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const prev = out[key];
    out[key] = isFieldNamespace(value) && isFieldNamespace(prev) ? deepMerge(prev, value) : value;
  }
  return out;
}

/** Every leaf path in a nested value object. */
function leafPaths(values: FieldValues, prefix: FieldPath = []): FieldPath[] {
  const out: FieldPath[] = [];
  for (const [key, value] of Object.entries(values)) {
    const path = [...prefix, key];
    if (isFieldNamespace(value)) out.push(...leafPaths(value, path));
    else out.push(path);
  }
  return out;
}

/** Stage (or overwrite) one field's draft value for an item. */
export function stageField(itemId: string, path: FieldPath, value: FieldValue): void {
  const item = drafts.get(itemId) ?? {};
  setAt(item, path, value);
  drafts.set(itemId, item);
  bump();
}

/** True iff the field currently has a staged draft value. */
export function hasStaged(itemId: string, path: FieldPath): boolean {
  return hasDraftAt(drafts.get(itemId), path);
}

/** The staged draft value, or `undefined` when nothing is staged for the field. */
export function stagedValue(itemId: string, path: FieldPath): FieldValue | undefined {
  return valueAt(drafts.get(itemId), path);
}

/**
 * The value to render: the draft when staged, else the applied value. The single
 * source the controls read so a push can never clobber an in-progress draft.
 */
export function effectiveValue(
  itemId: string,
  path: FieldPath,
  applied: FieldValue | undefined,
): FieldValue | undefined {
  const item = drafts.get(itemId);
  if (item !== undefined && hasDraftAt(item, path)) return valueAt(item, path);
  return applied;
}

/**
 * True iff the field is staged AND structurally different from the applied
 * value. A push that makes applied equal the draft clears the MARKER (honest —
 * the operator's draft now matches air) even though the draft entry lingers
 * until apply/discard.
 */
export function isFieldDirty(
  itemId: string,
  path: FieldPath,
  applied: FieldValue | undefined,
): boolean {
  const item = drafts.get(itemId);
  if (item === undefined || !hasDraftAt(item, path)) return false;
  return !valuesEqual(valueAt(item, path), applied);
}

/** True iff any staged field of the item differs from its applied value. */
export function isItemDirty(itemId: string, applied: FieldValues): boolean {
  const item = drafts.get(itemId);
  if (item === undefined) return false;
  for (const path of leafPaths(item)) {
    if (!valuesEqual(valueAt(item, path), valueAt(applied, path))) return true;
  }
  return false;
}

/**
 * The complete field-set for the ONE atomic `stack.update`: applied values with
 * every staged draft overlaid. Sending this (vs just the drafts) keeps the wire
 * payload identical to today's full-field update and is robust to `mergeMode` —
 * and it is why the Reconciler's shallow top-level merge stays correct for nested
 * templates: each namespace arrives WHOLE, never as a partial patch.
 */
export function buildApplyPayload(itemId: string, applied: FieldValues): FieldValues {
  const item = drafts.get(itemId);
  if (item === undefined) return { ...applied };
  return deepMerge(applied, item);
}

/**
 * R-018 — a `FieldValues` overlay holding just `value` at `path` (namespaces
 * created as needed). Used as BOTH the single-field apply payload's overlay and
 * the `clearStagedMatching` snapshot, so "what was sent" and "what to clear" can
 * never disagree.
 */
export function singleFieldOverlay(path: FieldPath, value: FieldValue): FieldValues {
  const out: FieldValues = {};
  setAt(out, path, value);
  return out;
}

/**
 * R-018 — the complete field-set for applying ONE overlay onto the applied
 * values (same wire shape as {@link buildApplyPayload}, but ONLY the overlay's
 * fields change — other staged drafts are deliberately NOT included).
 */
export function buildOverlayPayload(applied: FieldValues, overlay: FieldValues): FieldValues {
  return deepMerge(applied, overlay);
}

/** Drop an item's entire draft (on Discard). */
export function clearDraft(itemId: string): void {
  if (drafts.delete(itemId)) bump();
}

/** A deep copy of the item's current draft (the fields an apply will send). */
export function snapshotDraft(itemId: string): FieldValues {
  const item = drafts.get(itemId);
  return item === undefined ? {} : structuredClone(item);
}

/**
 * Clear ONLY the staged fields whose value still equals the given snapshot —
 * used after an accepted apply so a field the operator staged DURING the
 * in-flight round-trip (not in the sent payload, or re-edited to a newer value)
 * survives instead of being silently dropped.
 */
export function clearStagedMatching(itemId: string, snapshot: FieldValues): void {
  const item = drafts.get(itemId);
  if (item === undefined) return;
  let changed = false;
  for (const path of leafPaths(snapshot)) {
    if (hasDraftAt(item, path) && valuesEqual(valueAt(item, path), valueAt(snapshot, path))) {
      deleteAt(item, path);
      changed = true;
    }
  }
  if (Object.keys(item).length === 0) drafts.delete(itemId);
  if (changed) bump();
}

/** Delete the leaf at `path`, pruning namespaces it leaves empty. Mutates `root`. */
function deleteAt(root: FieldValues, path: FieldPath): void {
  const [head, ...rest] = path;
  if (head === undefined) return;
  if (rest.length === 0) {
    delete root[head];
    return;
  }
  const child = root[head];
  if (!isFieldNamespace(child)) return;
  deleteAt(child, rest);
  if (Object.keys(child).length === 0) delete root[head];
}

/**
 * What a prune is allowed to be driven by.
 *
 * A DELETE keyed on absence-of-evidence is the worst available combination of
 * those two facts, so the readiness is part of the ARGUMENT rather than a boolean
 * beside it: `{ ready: false }` carries no ids at all, so there is no shape in
 * which a caller can hand a prune an id list it cannot vouch for. That is the
 * difference between fixing this line and removing the landmine — a plain
 * `(ids, ready)` pair would let the next caller pass `true` by habit.
 */
export type StackPruneInput =
  | { readonly ready: false }
  | { readonly ready: true; readonly liveItemIds: ReadonlySet<string> };

/**
 * Drop drafts for items no longer on the stack.
 *
 * FAILS CLOSED on a snapshot that has not arrived. This is the cheap guard and it
 * is kept even though the call site moved: the failure mode is silent destruction
 * of work the operator typed, and there is no undo, which is exactly when defence
 * in depth is worth its cost. A prune that cannot tell what is on the stack has no
 * business deleting drafts.
 */
export function pruneDrafts(snapshot: StackPruneInput): void {
  if (!snapshot.ready) return;
  const live = snapshot.liveItemIds;
  let changed = false;
  for (const itemId of [...drafts.keys()]) {
    if (!live.has(itemId)) {
      drafts.delete(itemId);
      changed = true;
    }
  }
  if (changed) bump();
}

/** Test-only: wipe all drafts. */
export function __resetDraftsForTest(): void {
  drafts.clear();
  bump();
}

/**
 * Structural equality for field values (scalars, `{ assetId }`, and structured
 * `ListItem[]`). JSON-stable — object key order in these shapes is stable
 * (schema-shaped), so a stringify compare is sufficient and cheap.
 */
function valuesEqual(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== 'object' && typeof b !== 'object') return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
