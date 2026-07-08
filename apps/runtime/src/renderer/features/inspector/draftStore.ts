import type { FieldValue, FieldValues } from '@cg/shared-schema';

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
 */

const drafts = new Map<string, Record<string, FieldValue>>();
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

/** Stage (or overwrite) one field's draft value for an item. */
export function stageField(itemId: string, fieldId: string, value: FieldValue): void {
  const item = drafts.get(itemId) ?? {};
  item[fieldId] = value;
  drafts.set(itemId, item);
  bump();
}

/** True iff the field currently has a staged draft value. */
export function hasStaged(itemId: string, fieldId: string): boolean {
  return drafts.get(itemId)?.[fieldId] !== undefined;
}

/** The staged draft value, or `undefined` when nothing is staged for the field. */
export function stagedValue(itemId: string, fieldId: string): FieldValue | undefined {
  return drafts.get(itemId)?.[fieldId];
}

/**
 * The value to render: the draft when staged, else the applied value. The single
 * source the controls read so a push can never clobber an in-progress draft.
 */
export function effectiveValue(
  itemId: string,
  fieldId: string,
  applied: FieldValue | undefined,
): FieldValue | undefined {
  const item = drafts.get(itemId);
  if (item !== undefined && fieldId in item) return item[fieldId];
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
  fieldId: string,
  applied: FieldValue | undefined,
): boolean {
  const item = drafts.get(itemId);
  if (item === undefined || !(fieldId in item)) return false;
  return !valuesEqual(item[fieldId], applied);
}

/** True iff any staged field of the item differs from its applied value. */
export function isItemDirty(itemId: string, applied: FieldValues): boolean {
  const item = drafts.get(itemId);
  if (item === undefined) return false;
  for (const fieldId of Object.keys(item)) {
    if (!valuesEqual(item[fieldId], applied[fieldId])) return true;
  }
  return false;
}

/**
 * The complete field-set for the ONE atomic `stack.update`: applied values with
 * every staged draft overlaid. Sending this (vs just the drafts) keeps the wire
 * payload identical to today's full-field update and is robust to `mergeMode`.
 */
export function buildApplyPayload(itemId: string, applied: FieldValues): FieldValues {
  const item = drafts.get(itemId);
  if (item === undefined) return { ...applied };
  return { ...applied, ...item };
}

/** Drop an item's entire draft (on Discard). */
export function clearDraft(itemId: string): void {
  if (drafts.delete(itemId)) bump();
}

/** A shallow copy of the item's current draft (the fields an apply will send). */
export function snapshotDraft(itemId: string): Record<string, FieldValue> {
  const item = drafts.get(itemId);
  return item === undefined ? {} : { ...item };
}

/**
 * Clear ONLY the staged fields whose value still equals the given snapshot —
 * used after an accepted apply so a field the operator staged DURING the
 * in-flight round-trip (not in the sent payload, or re-edited to a newer value)
 * survives instead of being silently dropped.
 */
export function clearStagedMatching(itemId: string, snapshot: Record<string, FieldValue>): void {
  const item = drafts.get(itemId);
  if (item === undefined) return;
  let changed = false;
  for (const fieldId of Object.keys(snapshot)) {
    if (fieldId in item && valuesEqual(item[fieldId], snapshot[fieldId])) {
      delete item[fieldId];
      changed = true;
    }
  }
  if (Object.keys(item).length === 0) drafts.delete(itemId);
  if (changed) bump();
}

/** Drop drafts for items no longer on the stack (wired to the snapshot). */
export function pruneDrafts(liveItemIds: Iterable<string>): void {
  const live = new Set(liveItemIds);
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
