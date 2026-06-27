# Design — preview field form: explicit Update + textarea (D-106)

## Pending vs applied (the core decoupling)

Today `PreviewModal.onFieldChange(path, value)` does `setValues(...)` AND
`dispatch.update(next)` on EVERY keystroke — the form is fully controlled and
realtime. D-106 splits this into two value sets:

- **applied** (`NestedFieldValues`) — what's currently on the stage (the last
  value posted to the runtime via `dispatch.update`). Seeded from field defaults
  and applied to the preview on Play / Reset / Update.
- **pending** — per-field edits the operator has typed but not yet applied. Keyed
  by the field's nested path (e.g. `home.score`). A field is "pending" when its
  pending value differs from its applied value.

`onFieldChange` writes ONLY to pending (no `dispatch.update`). The stage changes
only when:

- **Update all** — merge every pending value into applied, `dispatch.update(applied)`
  once, clear pending.
- **Per-field Update** — merge that one field's pending value into applied,
  `dispatch.update(applied)`, clear that field's pending.

`anyPending = pending has any entry differing from applied` gates the global
"Update all" (disabled when nothing pending).

### Follow-up (#198) — per-INPUT, not per-field, for `list` fields

A `list` field (ticker / sequence items) is ONE `dirtyPaths` leaf, so the original
per-field design gave it a SINGLE Update for the whole list — operators reported
this as "one Update per element" rather than per editable value. Corrected to
per-INPUT: a scalar field keeps its one per-field Update (a field == an input), but
a `list` field's items each carry their OWN per-item Update inside `ListItemsEditor`
(no single whole-list Update). `PreviewModal.onUpdateListItem(path, itemId)` merges
just that item (matched by stable id) from pending into applied and posts the same
`update`, so it commits IN PLACE exactly like the per-field path; per-item dirtiness
is `JSON.stringify(item) !== JSON.stringify(appliedItemSameId)`.

## Pending indicator (reuse D-088/D-089)

The desktop-save dirty visual is `borderTop: 2px solid #ffdd40` (amber) keyed off
a `dirty` flag (`TopToolbar.css.ts`). Reuse the SAME amber for a per-field pending
treatment (a left/edge amber accent on the field row + a small per-field Update
affordance), and the same amber on the "Update all" control when `anyPending`.
Promote `#ffdd40` to a `colors.pending` token so it isn't duplicated inline.

## Textarea for long fields

`text` fields currently render as a single-line `<input>`; `multiline` already
renders a `<textarea>`. Add an auto-grow textarea path: render a `<textarea>`
(expandable, height auto-grows to content) for typically-long fields — `multiline`
(today) and `text` fields that are bound to ticker / sequence item text (or carry
a "long" hint). Auto-grow = set the textarea height to its `scrollHeight` on input.
Keep single-line for short fields (number/color/boolean/select unchanged).

## Edges / decisions

- **Reset** re-seeds the form to defaults AND applies them (clears pending) — a
  deliberate restore, so it applies immediately (preview reflects defaults),
  unchanged from today.
- **Play** applies the current applied values (Play already posts the values);
  pending edits made before Play follow the same explicit-Update rule (they don't
  silently apply on Play unless the operator Updated them) — Play uses `applied`.
- **List / repeater editors** (sequence/ticker items): the per-item editors write
  to pending like any field; "Update" applies the whole list value. (Per-item
  granularity inside a list stays a single field's pending unit.)
- No runtime/postMessage change — only the TIMING of `dispatch.update`.

## Out of scope

No schema change. Per-keystroke validation stays (it's local); only the APPLY to
the stage is gated. A diff/preview of pending-vs-applied values is future work.
