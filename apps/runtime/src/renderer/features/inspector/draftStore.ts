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
 *
 * ── ⭐ D-137 / C-015 — LIVE PLATE ASSIGNMENTS STAGE HERE TOO ────────────────
 *
 * A plate's source picker is an Inspector control, and it drafts like every other
 * one: staged locally, dirty-marked, discarded by Discard, written by Update.
 *
 * 🔴 **IT IS THE SAME STORE, NOT A SECOND ONE**, and that is the requirement
 * rather than tidiness (golden rule 6). One version counter, one `subscribeDrafts`,
 * one `clearDraft`, one `pruneDrafts`, one answer to "is this item dirty?". A
 * parallel draft path that agrees today is how the two come to disagree later —
 * and the failure mode here is an operator's unapplied edit destroyed with no
 * undo, which is precisely what the round-trip prune already did once
 * (`useStackHousekeeping`'s header).
 *
 * ⚠ IT IS A SEPARATE MAP INSIDE THIS MODULE, deliberately, and NOT a key in the
 * `FieldValues` overlay: that overlay IS the `stack.update` payload, so a plate
 * assignment living in it would be sent to the template as a field it never
 * declared. The assignment goes to `sources.set-assignments`, a different channel
 * with a different owner — `applyDraft` writes both from one operator action.
 *
 * ⚠ AND IT IS KEYED BY ITEM, even though the assignment it stages is
 * TEMPLATE-level. The DRAFT belongs to the editing session the operator is in —
 * it is theirs until they apply it — and keying it by item is what makes it
 * inherit, unchanged, every guard the field drafts already have: it survives a
 * selection switch, it survives a panel or fullscreen round-trip, and it is
 * dropped only by Discard or by a prune that can PROVE the item has left the
 * stack. The moment it is APPLIED it becomes template-level, which is the point
 * at which other rows see it.
 */

/** Address of one editable field: the namespace chain, then the field id. */
export type FieldPath = readonly string[];

const drafts = new Map<string, FieldValues>();
/**
 * D-137 / C-015 — staged plate assignments, per item: `plateId → sourceId`,
 * where the EMPTY STRING is a real staged value meaning "not assigned".
 *
 * It has to be distinguishable from "nothing staged": un-assigning a plate that
 * currently has a source is an edit like any other, and an absent entry would
 * make it indistinguishable from never having touched the control.
 */
const plateDrafts = new Map<string, Map<string, string>>();

/**
 * 🔴 **Session BM-2 — staged PER-LOOK input bindings, per item: `(look, plate) → sourceId`.**
 *
 * ── WHY A SECOND MAP AND NOT A WIDER `plateDrafts` ──────────────────────────
 *
 * They are edits at DIFFERENT LEVELS of the four, and conflating them would make the panel
 * lie about scope. `plateDrafts` stages the TEMPLATE ASSIGNMENT — shared by every row using
 * the template, applied through `sources.set-assignments`, and read at the next take. This
 * stages THIS ROW's composition — applied with the texts through `stack.update`, and on air
 * the moment it lands. One map would have to carry which level each entry belongs to, and
 * the first reader to forget would write a row's emergency composition into every other
 * row's configuration.
 *
 * ⚠ **`''` IS A VALUE HERE TOO, and it means something different from `plateDrafts`'s.**
 * There it stages "not assigned". Here it stages **"no per-look binding — fall back to the
 * template assignment"**, which is how a composition is UNDONE. Both are real edits and
 * neither is an absence; the recurring error this repo tracks is reading either as falsy.
 *
 * ⚠ **NESTED, not keyed by a composite string.** `itemId → lookId → plateId`. The obvious
 * alternative is a `${look}<sep>${plate}` key, and this repo already has one of those in
 * `channels/sources.ts` — where the separator is a literal NUL, which makes `git grep` call
 * that file BINARY and refuse to show a match inside it. That cost this very session real
 * time. Nesting needs no separator, cannot collide whatever ids arrive, and is the shape the
 * wire already uses (`StackItemState.lookSourceOverride`), so the writer copies rather than
 * parses.
 */
const lookBindingDrafts = new Map<string, Map<string, Map<string, string>>>();

/** The staged value for one `(look, plate)`, or `undefined` when nothing is staged. */
function stagedLookBinding(itemId: string, lookId: string, plateId: string): string | undefined {
  return lookBindingDrafts.get(itemId)?.get(lookId)?.get(plateId);
}

/**
 * Stage one look's input for one plate.
 *
 * `''` stages "no per-look binding" — the composition undone, falling back to the template
 * assignment. It is a real edit, so it is RECORDED rather than deleted: an absent entry means
 * "never touched", and the two must stay distinguishable or Discard cannot restore what the
 * operator started from.
 */
export function stageLookBinding(
  itemId: string,
  lookId: string,
  plateId: string,
  sourceId: string,
): void {
  const item = lookBindingDrafts.get(itemId) ?? new Map<string, Map<string, string>>();
  const look = item.get(lookId) ?? new Map<string, string>();
  look.set(plateId, sourceId);
  item.set(lookId, look);
  lookBindingDrafts.set(itemId, item);
  bump();
}

/** The value to render: the draft when staged, else what the row currently has bound. */
export function effectiveLookBinding(
  itemId: string,
  lookId: string,
  plateId: string,
  applied: string | undefined,
): string {
  return stagedLookBinding(itemId, lookId, plateId) ?? applied ?? PLATE_UNASSIGNED;
}

/** True iff this `(look, plate)` is staged AND different from what the row has bound. */
export function isLookBindingDirty(
  itemId: string,
  lookId: string,
  plateId: string,
  applied: string | undefined,
): boolean {
  const staged = stagedLookBinding(itemId, lookId, plateId);
  return staged !== undefined && staged !== (applied ?? PLATE_UNASSIGNED);
}

/**
 * 🔴 **THE COMPLETE MAP AN APPLY WILL SEND — applied, with the staged edits overlaid.**
 *
 * `stack.update`'s `lookBindings` REPLACES the row's map rather than merging it, because a
 * merge-only payload can add and change but never CLEAR — and clearing is how a composition
 * is undone. So the payload has to be the whole intended map, not the delta, exactly as the
 * field payload is (`buildApplyPayload`).
 *
 * A staged `''` therefore DROPS the entry here: "no per-look binding" is expressed by the
 * plate's absence from the map, which is what the resolver reads as "fall through to the
 * template assignment".
 */
export function buildLookBindingsPayload(
  itemId: string,
  applied: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [lookId, plates] of Object.entries(applied ?? {})) out[lookId] = { ...plates };
  for (const [lookId, plates] of lookBindingDrafts.get(itemId) ?? []) {
    for (const [plateId, sourceId] of plates) {
      const look = (out[lookId] ??= {});
      if (sourceId === PLATE_UNASSIGNED) delete look[plateId];
      else look[plateId] = sourceId;
    }
    if (Object.keys(out[lookId] ?? {}).length === 0) delete out[lookId];
  }
  return out;
}

/** A copy of the item's staged per-look edits (what an apply is about to send). */
export function snapshotLookBindingDraft(
  itemId: string,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const out = new Map<string, ReadonlyMap<string, string>>();
  for (const [lookId, plates] of lookBindingDrafts.get(itemId) ?? [])
    out.set(lookId, new Map(plates));
  return out;
}

/**
 * Clear ONLY the staged bindings whose value still equals the snapshot — the
 * `clearStagedMatching` rule, for the same reason: an input the operator re-picked DURING
 * the in-flight round-trip must survive rather than be silently dropped.
 */
export function clearStagedLookBindingsMatching(
  itemId: string,
  snapshot: ReadonlyMap<string, ReadonlyMap<string, string>>,
): void {
  const item = lookBindingDrafts.get(itemId);
  if (item === undefined) return;
  let changed = false;
  for (const [lookId, plates] of snapshot) {
    const look = item.get(lookId);
    if (look === undefined) continue;
    for (const [plateId, value] of plates) {
      if (look.get(plateId) !== value) continue;
      look.delete(plateId);
      changed = true;
    }
    if (look.size === 0) item.delete(lookId);
  }
  if (item.size === 0) lookBindingDrafts.delete(itemId);
  if (changed) bump();
}

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
 * D-137 / C-015 — stage one plate's source. `''` stages "not assigned", which is
 * a real edit and not an absence.
 */
export function stagePlateSource(itemId: string, plateId: string, sourceId: string): void {
  const item = plateDrafts.get(itemId) ?? new Map<string, string>();
  item.set(plateId, sourceId);
  plateDrafts.set(itemId, item);
  bump();
}

/**
 * B-139 — THE ONE SPELLING of "this plate has no source".
 *
 * The two sides of every plate comparison arrive in different shapes: a STAGED
 * value is `''` (`stagePlateSource`'s docstring: "`''` stages 'not assigned',
 * which is a real edit and not an absence"), while an APPLIED value is `null`
 * (`appliedPlateSources`). Reconciling them with an inline `?? ''` at each
 * comparison is how the two came to disagree — so the reconciliation is named
 * once and every comparison below goes through it.
 *
 * "An absent value is falsy" is on this repo's recurring-error list, and this is
 * that error's home in this feature: `''` is a VALUE here, never an absence.
 */
export const PLATE_UNASSIGNED = '';

/** Either representation of a plate's source, in the one canonical spelling. */
function plateValue(v: string | null | undefined): string {
  return v ?? PLATE_UNASSIGNED;
}

/**
 * The plate value to render: the draft when staged, else the APPLIED assignment.
 * The same rule the fields follow, so a push from another console can never
 * clobber an in-progress draft.
 */
export function effectivePlateSource(
  itemId: string,
  plateId: string,
  applied: string | null,
): string {
  const staged = plateDrafts.get(itemId)?.get(plateId);
  return staged ?? plateValue(applied);
}

/** True iff the plate is staged AND different from the applied assignment. */
export function isPlateDirty(itemId: string, plateId: string, applied: string | null): boolean {
  const staged = plateDrafts.get(itemId)?.get(plateId);
  return staged !== undefined && staged !== plateValue(applied);
}

/** A copy of the item's staged plate assignments (what an apply will write). */
export function snapshotPlateDraft(itemId: string): ReadonlyMap<string, string> {
  return new Map(plateDrafts.get(itemId) ?? []);
}

/**
 * Clear ONLY the staged plates whose value still equals the snapshot — the
 * `clearStagedMatching` rule, for the same reason: a plate the operator re-picked
 * DURING the in-flight round-trip must survive rather than be silently dropped.
 */
export function clearStagedPlatesMatching(
  itemId: string,
  snapshot: ReadonlyMap<string, string>,
): void {
  const item = plateDrafts.get(itemId);
  if (item === undefined) return;
  let changed = false;
  for (const [plateId, value] of snapshot) {
    if (item.get(plateId) === value) {
      item.delete(plateId);
      changed = true;
    }
  }
  if (item.size === 0) plateDrafts.delete(itemId);
  if (changed) bump();
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

/**
 * True iff any staged edit of the item differs from its applied value — FIELDS
 * and PLATES alike.
 *
 * 🔴 **`appliedPlates` is REQUIRED, and that is the whole of B-139's fix.**
 *
 * It used to be optional, with a docstring promising that omitting it meant "I am
 * not asking about plates". The code never implemented that promise: an omitted
 * map still iterated every staged plate and compared it against `''`, so the
 * comparison degenerated to `staged !== ''` — string truthiness. The stack row
 * omitted it (and the old docstring named the row as a caller that legitimately
 * could), so re-picking the SAVED source read as dirty while staging
 * _not assigned_ read as clean. Both faces, one missing argument.
 *
 * Requiring it is deliberate and is not the same fix as correcting the call site:
 * a corrected call site is one edit away from regressing, while a required
 * parameter makes the wrong question a COMPILE ERROR. Do not restore the default
 * — `appliedPlateSources` is the canonical join and every caller can reach it.
 *
 * Pass an EMPTY map only for an item that genuinely declares no plates; that is a
 * statement ("this template has none"), not an omission.
 */
export function isItemDirty(
  itemId: string,
  applied: FieldValues,
  appliedPlates: ReadonlyMap<string, string | null>,
  /** Session BM-2 — the row's applied per-look map, from `StackItemState.lookSourceOverride`. */
  appliedLookBindings?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
): boolean {
  const item = drafts.get(itemId);
  if (item !== undefined) {
    for (const path of leafPaths(item)) {
      if (!valuesEqual(valueAt(item, path), valueAt(applied, path))) return true;
    }
  }
  const plates = plateDrafts.get(itemId);
  if (plates !== undefined) {
    for (const [plateId, value] of plates) {
      if (value !== plateValue(appliedPlates.get(plateId))) return true;
    }
  }
  /*
    🔴 **BM-2 §3.3 — THE PER-LOOK COMPOSITION IS THE SAME FACT, not a second one.**

    The dirty chip and the enabled UPDATE verb both read this one function, so a third kind
    of staged edit has to be answered here or the panel says "clean" while UPDATE has work to
    do — an operator would press nothing and lose the composition to the next Discard.
    `appliedLookBindings` is passed in for the same reason `appliedPlates` is: this module
    stages edits and does not know what is applied.
  */
  const looks = lookBindingDrafts.get(itemId);
  if (looks !== undefined) {
    for (const [lookId, plates2] of looks) {
      for (const [plateId, value] of plates2) {
        if (value !== (appliedLookBindings?.[lookId]?.[plateId] ?? PLATE_UNASSIGNED)) return true;
      }
    }
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

/** Drop an item's entire draft — fields AND plates — on Discard. */
export function clearDraft(itemId: string): void {
  const hadFields = drafts.delete(itemId);
  const hadPlates = plateDrafts.delete(itemId);
  // Session BM-2 — and the per-look composition. A Discard that left one behind would be an
  // unapplied edit the operator can no longer see, on a panel reporting itself clean.
  const hadLooks = lookBindingDrafts.delete(itemId);
  if (hadFields || hadPlates || hadLooks) bump();
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
  // EVERY map, from the one guard. A draft of any kind that outlived this sweep would be an
  // unapplied edit the operator can no longer see or reach.
  for (const map of [drafts, plateDrafts, lookBindingDrafts] as {
    delete: (k: string) => boolean;
    keys: () => IterableIterator<string>;
  }[]) {
    for (const itemId of [...map.keys()]) {
      if (!live.has(itemId)) {
        map.delete(itemId);
        changed = true;
      }
    }
  }
  if (changed) bump();
}

/** Test-only: wipe all drafts, both kinds. */
export function __resetDraftsForTest(): void {
  drafts.clear();
  plateDrafts.clear();
  lookBindingDrafts.clear();
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
