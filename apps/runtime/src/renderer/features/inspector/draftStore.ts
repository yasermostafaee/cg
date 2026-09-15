import {
  isFieldNamespace,
  type FieldValue,
  type FieldValues,
  type PositionAnchor,
  type StackItemTimingOverride,
} from '@cg/shared-schema';

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

/**
 * 🔴 **`RUNTIME-REDESIGN-01` PHASE 5 — THE POSITION DRAFT, per item: anchor and the two
 * offsets AS TYPED.**
 *
 * ── WHY IT IS HERE AND NOT IN THE PICKER ─────────────────────────────────────
 *
 * `PositionPicker` used to hold the anchor and the offsets in `useState`, keyed by item, so
 * the component REMOUNTED on every selection change and the operator's unapplied position
 * went with it. Every other kind of staged edit in this panel — a field, a plate, a
 * per-look input — survives a selection round trip because it lives in THIS store; the
 * position was the one edit that did not, and `PROMPT.md` §5's rule is that a row's draft
 * is kept: _selecting another row and coming back does not lose it._ Session state, like
 * every map above it: no persisted key, file or schema (§5's own constraint).
 *
 * ── WHY IT IS A FOURTH MAP AND NOT A KEY IN THE FIELD OVERLAY ────────────────
 *
 * The same reason `plateDrafts` is: the field overlay IS the `stack.update` payload, and a
 * position living in it would be sent to the template as a field it never declared. A
 * position travels on `stack.setPosition`, its own channel. **That is unchanged and is the
 * reason this map still exists** — the reversal below is about which CONTROL commits it,
 * never about which wire carries it.
 *
 * ── 🔴 THE POSITION IS PART OF THE ROW'S ONE COMMIT (owner, 2026-09-14) ──────
 *
 * ⚠ **THIS REVERSES A RECORDED DECISION, and the old text is REPLACED rather than left
 * standing beside it.** It read: _"`clearDraft` (the commit bar's DISCARD) leaves the
 * position draft alone, and `isItemDirty` does not read it. Both halves follow from one
 * fact: UPDATE does not send the position… The position keeps its OWN lifecycle: its own
 * dirty dot, its own `Apply position`…"_
 *
 * The owner's call: «دکمه apply position فقط یه مرحله اضافیه و همون دکمه update باید
 * پوزیشن رو هم اعمال کنه و همچنین discard هم روش کار کنه» — `Apply position` is an extra
 * step; UPDATE should apply the position too, and DISCARD should work on it.
 *
 * 🔴 **THE OLD ARGUMENT WAS NOT WRONG — ITS PREMISE MOVED, which is the only honest way to
 * retire it.** It said a chip pointing at an edit UPDATE would not send is a control whose
 * word lies. That was exactly right *while UPDATE did not send the position*. UPDATE sends
 * it now, so the same reasoning inverts and demands the opposite: the chip MUST light, the
 * verb MUST be enabled, and DISCARD MUST drop it — a staged position that survived a
 * Discard would be the unapplied edit nobody can see, which is the defect that argument
 * existed to prevent.
 *
 * So `clearDraft` drops it and {@link isItemDirty} reads it, alongside the fields, the
 * plates and the per-look composition. A prune still sweeps it, because a draft for a row
 * that has left the stack is unreachable.
 *
 * The offsets are kept as the STRINGS the operator typed, not as numbers: `"-"`, `"1."`
 * and `""` are in-progress states a round trip must not flatten to `0`.
 */
export interface PositionDraft {
  readonly anchor: PositionAnchor;
  readonly x: string;
  readonly y: string;
}

const positionDrafts = new Map<string, PositionDraft>();

/** Stage the item's whole position draft (the picker writes all three together). */
export function stagePosition(itemId: string, draft: PositionDraft): void {
  positionDrafts.set(itemId, draft);
  bump();
}

/** The item's staged position, or `undefined` when nothing is staged for it. */
export function positionDraftOf(itemId: string): PositionDraft | undefined {
  return positionDrafts.get(itemId);
}

/**
 * Drop just the position draft — what an ACCEPTED send clears.
 *
 * ⚠ Narrower than {@link clearDraft} on purpose: a press commits several halves and each
 * clears only its own, so an accepted position must not take an unrelated field edit the
 * operator staged during the round trip with it. Same rule as `clearStagedMatching`.
 */
export function clearPositionDraft(itemId: string): void {
  if (positionDrafts.delete(itemId)) bump();
}

/**
 * 🔴 `TIMING-WIRE-22 · DELTA B4` — **A TIMING EDIT IS A DRAFT, LIKE EVERY OTHER ONE.**
 *
 * ── WHAT IT REPLACES, AND WHY THAT WAS WRONG ─────────────────────────────────
 *
 * The passes and gap boxes committed ON BLUR. Two things followed, both owner-observed: the
 * typed value VANISHED (the box cleared itself before the operator could check the number),
 * and a blur — a click anywhere else on the panel — SENT A COMMAND TOWARD AIR. Every other
 * Inspector edit stages and waits for one press; timing was the only surface on which looking
 * away was a commit.
 *
 * ── WHY IT IS A FIFTH MAP AND NOT A KEY IN THE FIELD OVERLAY ─────────────────
 *
 * The same reason `plateDrafts` and `positionDrafts` are: that overlay IS the `stack.update`
 * payload, and a pass count living in it would be sent to the template as a field it never
 * declared. Timing travels on `stack.set-pass-timing`, its own channel. What changes here is
 * only which CONTROL commits it — no wire, no IPC schema and no persisted key moves.
 *
 * ── 🔴 THE VALUES ARE KEPT AS THE OPERATOR TYPED THEM ───────────────────────
 *
 * `""`, `"1."` and `"-"` are in-progress states, and a draft that round-tripped them through
 * a number would flatten each to `0` under the operator's cursor. The same rule
 * {@link PositionDraft} keeps, for the same reason.
 *
 * ⚠ `passes` is a DISCRIMINATED UNION rather than a string with `'infinite'` smuggled into it.
 * "Until stop" is a CHOICE made on a two-state control, not text anybody typed, and a sentinel
 * string would be indistinguishable from an operator typing the word.
 *
 * ⚠ **AND `until-stop` CARRIES THE TEXT IT CAME FROM**, which looks redundant and is not. The
 * two-state control is a round trip an operator makes while thinking — type 7, try `Until stop`,
 * change your mind — and without this the flip back to `Count` re-seeded the box from the row's
 * STORED count and ate the 7. Measured: staged 7, flipped twice, got 3 back. The CHOICE decides
 * what a press sends; the text is only remembered, and `timingPassesOf` never reads it here.
 */
export interface TimingDraft {
  /** The passes half. `undefined` — the operator has not touched it. */
  readonly passes?:
    | { readonly kind: 'until-stop'; readonly text?: string | undefined }
    | { readonly kind: 'count'; readonly text: string }
    | undefined;
  /** The gap in SECONDS, as typed. `undefined` — untouched. */
  readonly gapSeconds?: string | undefined;
}

const timingDrafts = new Map<string, TimingDraft>();

/**
 * Stage one half of the item's timing draft, MERGING with whatever is already staged.
 *
 * ⚠ Merging rather than replacing is the contract: the two halves are edited by two separate
 * controls, and a replace would mean typing a gap silently dropped a pass count the operator
 * had just chosen. A caller that means "forget the passes half" passes `{ passes: undefined }`,
 * which is why the merge reads the KEY's presence and not the value's.
 */
export function stageTiming(itemId: string, patch: TimingDraft): void {
  const prior = timingDrafts.get(itemId) ?? {};
  timingDrafts.set(itemId, {
    ...prior,
    ...('passes' in patch ? { passes: patch.passes } : {}),
    ...('gapSeconds' in patch ? { gapSeconds: patch.gapSeconds } : {}),
  });
  bump();
}

/** The item's staged timing, or `undefined` when nothing is staged for it. */
export function timingDraftOf(itemId: string): TimingDraft | undefined {
  return timingDrafts.get(itemId);
}

/**
 * Drop just the timing draft — what an ACCEPTED send clears.
 *
 * ⚠ Narrower than {@link clearDraft}, for the reason {@link clearPositionDraft} states: one
 * press commits several halves and each clears only its own, so an accepted timing change must
 * not take a field edit staged during the round trip with it.
 */
export function clearTimingDraft(itemId: string): void {
  if (timingDrafts.delete(itemId)) bump();
}

/**
 * The passes value a send would carry, or `undefined` when the draft states none.
 *
 * ⚠ `0` returns `0`. It is the instruction "out after this pass", and reading it as absent is
 * the silent-clamp failure this feature already guards against at three other layers. Anything
 * that is not a whole number ≥ 0 returns `undefined` — the control REFUSES such text with a
 * reason rather than sending a rewritten value, so `undefined` here can only ever mean
 * "nothing to send" and never "send something else".
 */
export function timingPassesOf(draft: TimingDraft | undefined): number | 'infinite' | undefined {
  const passes = draft?.passes;
  if (passes === undefined) return undefined;
  if (passes.kind === 'until-stop') return 'infinite';
  const text = passes.text.trim();
  if (text === '') return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** The gap a send would carry in MILLISECONDS, or `undefined` when the draft states none. */
export function timingDelayMsOf(draft: TimingDraft | undefined): number | undefined {
  const text = draft?.gapSeconds?.trim();
  if (text === undefined || text === '') return undefined;
  const seconds = Number(text);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

/**
 * Is the item's staged timing different from what is APPLIED?
 *
 * ⚠ The comparison is on the VALUES a send would carry, not on the strings — the rule
 * {@link isPositionDirty} keeps, for its reason. A draft reading `"2"` against an applied `2`
 * is NOT dirty, so re-typing the number already stored does not demand an UPDATE that would
 * change nothing; and a half-typed `"1."` carries no value, so it is not dirty either.
 */
export function isTimingDirty(
  itemId: string,
  applied: StackItemTimingOverride | undefined,
): boolean {
  const draft = timingDrafts.get(itemId);
  if (draft === undefined) return false;
  const passes = timingPassesOf(draft);
  if (passes !== undefined && passes !== applied?.repeat) return true;
  const delayMs = timingDelayMsOf(draft);
  return delayMs !== undefined && delayMs !== applied?.delayMs;
}

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
  /**
   * 🔴 The row's APPLIED position — `INSPECTOR-DELTA`, owner 2026-09-14. Optional because
   * every caller that does not show a position picker (and every existing test) has no such
   * value to pass, and a row with nothing staged is clean either way; passing it is what
   * makes the commit bar answer for the position as well as the text.
   */
  appliedPosition?: { anchor: PositionAnchor; offset: { x: number; y: number } } | undefined,
  /**
   * 🔴 The row's APPLIED timing override — `DELTA B4`. Optional for the reason
   * `appliedPosition` is: a caller with no timing surface has no such value to pass, and a row
   * with nothing staged is clean either way.
   */
  appliedTiming?: StackItemTimingOverride | undefined,
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
  /*
    🔴 …AND THE POSITION, now that UPDATE sends it (this module's header carries the owner's
    reversal and why the old argument inverts rather than merely losing). The chip and the
    verb read THIS function and nothing else, so a staged position that did not answer here
    would leave the panel reporting itself clean with a move still to send.
  */
  if (appliedPosition !== undefined && isPositionDirty(itemId, appliedPosition)) return true;
  /*
    🔴 …AND THE TIMING (`DELTA B4`). Unlike the position it needs no applied argument to be
    RESOLVED — `StackItemState.timingOverride` is the applied truth outright — but it is passed
    in for the reason everything else here is: this module stages edits and does not know what a
    row has applied. A staged count that did not answer here would leave the bar reporting itself
    clean with a pass count still to send, and DISCARD would drop it having never said it was
    there.
  */
  if (isTimingDirty(itemId, appliedTiming)) return true;
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

/** Drop an item's entire draft — fields, plates, per-look inputs AND position — on Discard. */
export function clearDraft(itemId: string): void {
  const hadFields = drafts.delete(itemId);
  const hadPlates = plateDrafts.delete(itemId);
  // Session BM-2 — and the per-look composition. A Discard that left one behind would be an
  // unapplied edit the operator can no longer see, on a panel reporting itself clean.
  const hadLooks = lookBindingDrafts.delete(itemId);
  /*
    🔴 …AND THE POSITION, since the owner folded it into the one commit (see this module's
    header). It is listed LAST only because it arrived last; it is not a lesser member —
    a Discard that left it staged is precisely the "unapplied edit nobody can see" the line
    above is about, on the one edit that moves a graphic rather than its text.
  */
  const hadPosition = positionDrafts.delete(itemId);
  // …AND THE TIMING (`DELTA B4`), by the same argument: a staged count that survived a Discard
  // is an unapplied edit nobody can see, and this one reaches air at the next take.
  const hadTiming = timingDrafts.delete(itemId);
  if (hadFields || hadPlates || hadLooks || hadPosition || hadTiming) bump();
}

/**
 * Is the item's staged position different from what is APPLIED?
 *
 * ⚠ The comparison is on the VALUES a send would carry, not on the strings: the draft keeps
 * `"-"`, `"1."` and `""` as typed, and `offsetNumber` collapses each to the number
 * `stack.setPosition` would receive. Comparing the raw strings would report a row dirty
 * because the operator typed `-0` where `0` is applied — an UPDATE the panel demands and
 * that would change nothing.
 */
export function isPositionDirty(
  itemId: string,
  applied: { anchor: PositionAnchor; offset: { x: number; y: number } },
): boolean {
  const draft = positionDrafts.get(itemId);
  if (draft === undefined) return false;
  return (
    draft.anchor !== applied.anchor ||
    offsetNumber(draft.x) !== applied.offset.x ||
    offsetNumber(draft.y) !== applied.offset.y
  );
}

/**
 * One typed offset as the number a send carries. Anything that is not a finite number is
 * `0` — the same collapse `PositionPicker` has always applied at the moment of sending, kept
 * here so the dirty test and the send cannot disagree about what a half-typed box means.
 */
export function offsetNumber(raw: string): number {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : 0;
}

/**
 * 🔴 **THE POSITION AS THE OPERATOR HAS IT — applied, with any staged move overlaid.**
 *
 * The position half of {@link buildApplyPayload}, and it exists for the same reason and is
 * used by the same surface: PVW renders the EFFECTIVE values so that what is rehearsed is
 * exactly what a press would send.
 *
 * The owner asked for it specifically once `Apply position` was folded into UPDATE
 * (2026-09-14): «فقط در حالت pvw نیازه که با تغییر پوزیشن بدون اپدیت هم موقعیت در pvw تغییر
 * کنه بصورت لحظه‌ای و realtime، در حقیقت با onchange اینپوتها» — in PVW the placement must
 * follow the boxes as they are typed, with no UPDATE in between. That is what makes the
 * merged commit workable rather than blind: the button that used to let an operator SEE a
 * move before committing it is gone, so the preview has to show the move instead.
 *
 * ⚠ **PVW ONLY, and that is a property of the CALLER rather than of this function.** It
 * reports what is staged; nothing here reaches CasparCG (`R-022`: the rehearsal is a local
 * browser render). The row's own state and the air path keep reading `item.position`, which
 * is the applied value and the only one that is true of the channel.
 *
 * 🔴 **`undefined` IN IS `undefined` OUT, AND THAT IS LOAD-BEARING — it is not defensive
 * typing.** A row with no applied override must reach the rehearsal frame with NO position
 * at all, because the frame ABSTAINS on absence: an empty search would resolve to CENTRED
 * and move a correctly-placed graphic (`rehearse-composite.spec.ts`, "an applied position
 * reaches the SELECTED row's frame and no other"). The first spelling of this function took
 * a non-optional `applied` and its caller filled the gap with the manifest default — which
 * silently turned every abstaining row into `?pos=center&dx=0&dy=0`. The e2e caught it; the
 * signature is what stops it coming back.
 */
export function effectivePosition(
  itemId: string,
  applied: { anchor: PositionAnchor; offset: { x: number; y: number } } | undefined,
): { anchor: PositionAnchor; offset: { x: number; y: number } } | undefined {
  const draft = positionDrafts.get(itemId);
  // No staged move: whatever is applied, INCLUDING nothing. See the note above.
  if (draft === undefined) return applied;
  /*
    A draft carries the whole placement (the picker seeds it from the applied value, or from
    the manifest default, before it stages anything), so it is built from the draft alone —
    `applied` is not consulted here and must not be, or a row with no override would inherit
    a centre it never chose.
  */
  return {
    anchor: draft.anchor,
    offset: { x: offsetNumber(draft.x), y: offsetNumber(draft.y) },
  };
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
  /*
    EVERY map, from the one guard. A draft of any kind that outlived this sweep would be an
    unapplied edit the operator can no longer see or reach.

    ⚠ This used to say the position was "the one map `clearDraft` leaves alone". That stopped
    being true when the owner folded the position into the one commit (2026-09-14), and it is
    corrected rather than left standing: Discard drops every map in this list. A prune differs
    only in its reason — the ROW is gone, so there is nothing left for any draft to belong to.
  */
  for (const map of [drafts, plateDrafts, lookBindingDrafts, positionDrafts, timingDrafts] as {
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

/** Test-only: wipe all drafts, every kind. */
export function __resetDraftsForTest(): void {
  drafts.clear();
  plateDrafts.clear();
  lookBindingDrafts.clear();
  positionDrafts.clear();
  timingDrafts.clear();
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
