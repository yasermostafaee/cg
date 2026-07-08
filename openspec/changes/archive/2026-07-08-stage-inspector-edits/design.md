# Design — staged Inspector edits (R-003)

## Today's mechanism (what gets replaced)

- Every `FieldControl` branch commits immediately: text/number/image on blur
  (Enter→blur), boolean/color/select on change, the list editor's item text on
  blur and structural ops instantly (`Inspector.tsx` `commit()` →
  `stack.update` per field).
- Scalar inputs are UNCONTROLLED (`defaultValue`) and resync to pushes via
  remount keys (`key={fieldId-value}`); the list editor holds local state and
  remounts via `key={fieldId-JSON.stringify(value)}`.
- **The recorded hazard (R-003 Notes)**: a blur-commit triggers that remount —
  on the synchronous mock path the remount detaches the mousedown'ed node so
  the FIRST click on ↑/↓/×/Add is swallowed; on the live bridge the delayed
  push re-seeds the editor and discards keystrokes typed into another row.

## The replacement: a draft overlay, controlled views, stable keys

### Draft store (`features/inspector/draftStore.ts` — framework-free, node-testable)

A module-level store: `Map<itemId, Record<fieldId, FieldValue>>` + a version
counter + subscribe (consumed via `useSyncExternalStore`). API:

- `stageField(itemId, fieldId, value)` — record a draft value (full field
  value; for lists, the whole structured `ListItem[]`).
- `stagedValue(itemId, fieldId)` / `hasStaged(itemId, fieldId)`.
- `isFieldDirty(itemId, fieldId, appliedValue)` — staged AND structurally
  different from applied (JSON-stable compare). A push that makes applied
  equal the draft clears the MARKER automatically (honest), while the draft
  entry itself stays until applied/discarded.
- `isItemDirty(itemId, appliedFields)` — any field dirty.
- `buildApplyPayload(itemId, appliedFields)` — `{ ...applied, ...draft }`: the
  complete field-set for the ONE atomic `stack.update`.
- `clearDraft(itemId)` — on apply-accepted and on Discard.
- `pruneDrafts(liveItemIds)` — drops drafts of removed items (wired to the
  stack snapshot in StackPanel).

Drafts never touch the bridge; the store is renderer-local session state.

### Controlled views (the remount-key removal)

Every field renders the **draft-or-applied** value:
`hasStaged ? stagedValue : item.fields[fieldId]`.

- Text, textarea, list-item textareas, color, select, checkbox, image become
  fully CONTROLLED (`value` + `onChange → stageField`). No blur handlers, no
  Enter→blur handlers (Enter in a textarea inserts a newline natively; Enter
  in a single-line input does nothing). Stable keys (`fieldId` / list `item.id`)
  — **no remount keys anywhere**. An incoming push updates the APPLIED value:
  un-staged fields follow it live; staged fields keep showing the draft — no
  clobber, no remount, the first click always lands.
- The `list` editor drops its local `useState` entirely: it renders
  `toListItems(draft-or-applied)` and stages `setItemText`/`addItem`/
  `removeItem`/`moveItem` results. Structural ops become staged like text —
  contract point 1.
- **Number fields (`NumberField`, controlled — corrected after review)**: a
  controlled number input cannot hold an in-progress invalid prefix ("-", "1.",
  ""). The first design kept it uncontrolled with a `draft`-frozen key — but the
  adversarial review proved that key flips on the FIRST keystroke, remounting the
  input and dropping focus (multi-digit typing lost every digit after the first),
  and the itemId-less key could reuse a stale DOM node across same-id fields. The
  fix is a controlled `NumberField` holding a local raw-string: it stages the
  parsed number on change while preserving the exact text, and re-seeds the text
  ONLY when the effective value changes from OUTSIDE its own edits (push /
  discard / apply / item switch) via the "adjust state during render" pattern —
  so a keystroke never remounts and typing is never lost. (All `FieldEditor`s are
  now additionally keyed by `itemId-fieldId`, so switching stack items remounts
  every control against the new item's draft-or-applied value — no DOM node is
  ever shared across items.)

### Apply and discard

- StackPanel's UPDATE button (and an equivalent minimal Update button in the
  Inspector header — contract 2 "MAY") calls `applyDraft(item)`:
  `stack.update({ itemId, fields: buildApplyPayload(...), mergeMode: 'merge' })`
  — one atomic payload, unchanged wire shape. On `accepted` it clears ONLY the
  fields it actually sent (`clearStagedMatching` against a `snapshotDraft`
  captured at click time) — a field the operator stages DURING the in-flight
  round-trip, or re-edits to a newer value, survives instead of being silently
  dropped (review finding). A rejected/failed apply keeps every edit staged.
  The B-044 lifecycle takes over (transient `updating` → settles / `unconfirmed`).
- The row button's pre-existing STATUS gating (disabled for idle/loaded) is
  untouched — out of scope to redesign command gating. Contract 3 is about
  dirty-state: nothing ever disables UPDATE because a draft is absent; sending
  unchanged values stays possible (the documented B-048 workaround, which the
  operator performed with the row button enabled).
- Discard (Inspector header, visible when the item is dirty) → `clearDraft` —
  every field reverts to the last applied values instantly (controlled views).
- Take / Out / Remove never touch drafts (Remove prunes via the snapshot).

### Dirty visibility (minimal styling; UI-polish restyles later)

- Per-field: an amber `●` next to the field label while
  `isFieldDirty`.
- Per-item: a small amber `● draft` chip — in the Inspector header AND in the
  stack row next to the title (contract 6: a dirty item stays visibly dirty
  from the stack, so the operator knows air ≠ draft when Taking).

## MockRuntime

No behavior change (verified): staging never reaches it; the apply sends the
same `{ itemId, fields, mergeMode: 'merge' }` it already handles; audit
semantics unchanged (only applied updates are audited — staging is invisible).

## Tests

- **Unit** (`draftStore.test.ts`, node): stage/overwrite; dirty vs equal-value
  staging; a push (new applied fields) never clobbers a draft AND clears the
  dirty marker when values converge; discard; `buildApplyPayload` merges the
  complete set; per-item independence; prune.
- **E2E** (MockRuntime): blur and Enter send NOTHING (the stack snapshot's
  applied fields are unchanged); UPDATE applies the full staged set at once;
  Discard reverts; the FIRST click on a reorder button lands immediately after
  editing another item's text (the hazard acceptance); a draft survives
  switching selection away and back (two loaded items); the two-line ticker
  item still round-trips — the existing blur-commit specs keep their intent
  with the commit step re-encoded on the UPDATE button; badge-settle e2e keeps
  passing (apply now via UPDATE).
- The bridge→mock matrix is untouched (no bridge change).

## Out of scope

Bridge/protocol, busy visuals, AMCP escape rule, audit semantics, command
gating redesign, styling beyond minimal markers (queued UI-polish, which also
renames TAKE→PLAY).
