# Runtime Inspector list-field editor (B-040)

## Why

B-040 (filed, hardware-observed): a ticker's `list` Data key (e.g. `_tickerTexts`)
shows in the Runtime Inspector as the literal text `"[object Object],[object
Object]"` and is committed that way on the wire. The seed (`defaultFieldValue` →
array) and the wire (`JSON.stringify`) are already correct; the **only** defect is
that the Inspector's `FieldControl` has **no `list` branch**, so a structured array
falls through to the default text `<input>` — `String(array)` → `"[object Object]"`
on display, and `onBlur` commits that string via `stack.update`. The Designer
already renders this field correctly (`ListItemsEditor` / `PreviewFieldForm`); the
Runtime Inspector just never got an equivalent control.

## What Changes

Give the Runtime Inspector's `FieldControl` a proper **`list`** branch — a small
structured items editor — so a `list` field's value stays **structured JSON
end-to-end** (display, edit, and the `CG ADD` / `CG UPDATE` payload). The editor:

- renders one row per item, editing the item's `text` (the ticker/list data),
  preserving each item's stable `id` and any other (unknown) fields per the
  extensible `ListItem` shape in `@cg/shared-schema`;
- supports add / remove / reorder;
- commits the **structured `ListItem[]`** array via `stack.update` (never a
  `String()`-coerced string);
- never `String()`-coerces an array into the text input — a non-array value
  (including the legacy `"[object Object]"` string) yields an empty editor, not a
  corrupted text field.

`inferKind` also maps an array value to `list`, so a list field renders the editor
even without a resolved schema.

### Reuse decision (resolved in design)

**Build a focused Runtime-local editor** (not extract a shared package). The
Designer's `ListItemsEditor` / `PreviewFieldForm` are deeply Designer-coupled — they
import the Designer's app-local UI primitives (`Button` / `Control` / `Icon` /
`Select` / `Textarea`), vanilla-extract CSS, and authoring-only features (composition
kind picker, dwell, repeater columns, per-item data-key binding, per-item Update).
Extraction would drag all of that into a shared package, against the repo's
architecture (components live app-local; `@cg/ui` is tokens-only). The shared seam is
the **`ListItem` / `list` field type in `@cg/shared-schema`** (already shared), not a
React component. The Runtime operator only needs to edit item text + add/remove/
reorder, so a small editor matching the Inspector's raw-element + inline-style
conventions is the clean choice. See `design.md`.

## Capabilities

- `runtime-template-library` (ADDED): the operator Inspector edits a `list`
  (array) dynamic field with a structured items editor — display, edit, and the
  committed `stack.update` payload all preserve the `ListItem[]` structure; a list
  value is never rendered or sent as a `String()`-coerced `"[object Object]"`.

## Impact

- `apps/runtime` — Inspector `FieldControl` gains a `list` branch +
  `ListFieldEditor` component; `inferKind` maps arrays to `list`; pure list-edit
  helpers (`listField.ts`).
- Tests — a unit test for the pure list-edit helpers (structure preserved, never
  stringified) + an E2E for import → inspect → edit of a ticker `list` field (the
  Inspector shows an items editor, not `"[object Object]"`, and edits round-trip as
  structure through `stack.update`).
- No shared package change (no extraction).
- B-040 stays `[~]` until reviewed/merged.
