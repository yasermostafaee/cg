# Design — Runtime Inspector list-field editor (B-040)

## The defect (recap)

`apps/runtime/.../inspector/Inspector.tsx` `FieldControl` has branches for
boolean/number/color/select/image/multiline + a **default text `<input>`**, but no
`list` branch. A `list` value (array of `{ id, text, … }`) hits the default input:
`const v = … : String(value)` → `"[object Object],[object Object]"` on display, and
`onBlur` commits `e.target.value` (that string) via `stack.update`. The seed
(`defaultFieldValue` → array) and the wire (`command-builder` `JSON.stringify`) are
already correct — the Inspector is the sole coercion site.

## Reuse decision: build a focused Runtime-local editor (NOT extract)

The Designer's `ListItemsEditor` / `PreviewFieldForm` are **not** cleanly
extractable:

- `ListItemsEditor` imports the Designer's app-local UI primitives (`Button`,
  `Control`, `Icon`, `Select`, `Textarea`), its vanilla-extract CSS
  (`ListItemsEditor.css.ts`), and `repeater-columns`; it carries authoring-only
  features — composition kind picker (D-083), per-item dwell (D-029), repeater
  columns (D-030), per-item data-key binding (D-083), per-item Update (D-106).
- `PreviewFieldForm` adds more Designer coupling (`Callout`, `cx`, preview refs).

The repo's architecture keeps **components app-local**; `@cg/ui` is **tokens-only**
(no shared component library). Extracting would either pull the Designer's whole UI
primitive set into a shared package or force a rewrite of all those primitives —
neither "genuinely clean". The Runtime operator needs far less: edit each item's
`text`, add/remove/reorder. So we build a **small Runtime-local editor**
(`ListFieldEditor`) matching the Inspector's existing raw-element + inline-`styles`
conventions (the Runtime has no `ui/` primitives dir and uses raw `<input>` /
`<button>` already).

**The shared seam is the data shape, not the component.** Both apps consume
`ListItem` / `ListField` from `@cg/shared-schema`; the editor edits that shape and
preserves unknown fields, so authoring (Designer) and operating (Runtime) stay
structurally compatible. (If a richer Runtime list UX is ever needed, a shared
_headless_ hook could be extracted then — out of scope here.)

## Implementation

- `inspector/listField.ts` — pure, JSON-only helpers (node-testable):
  - `toListItems(value)` → `ListItem[]` (array passes through; anything else → `[]`
    — the explicit "never `String()` an array" guard);
  - `itemText(item)`, `setItemText`, `addItem(items, id)`, `removeItem`,
    `moveItem` — all preserve each item's `id` + unknown fields and return arrays.
- `inspector/ListFieldEditor.tsx` — a small stateful editor (local `items` state
  seeded from `value`): one auto-growing multi-line textarea per item (see
  "Multi-line items" below) + ↑/↓/× controls + "Add item".
  Text edits update local state and commit on blur; add/remove/reorder commit
  immediately. New item ids use the Runtime's `uuid()` helper. Commits the
  structured `ListItem[]` via `onCommit` (a `ListItem[]` is a valid `FieldValue`).
- `Inspector.tsx`:
  - `FieldControl` gains a `list` branch (before the default text branch) rendering
    `<ListFieldEditor>`, keyed by the value signature so switching stack items /
    external updates re-seed (mirrors the scalar inputs' `key={fieldId-value}`).
  - `inferKind` maps `Array.isArray(value)` → `list`, so a list renders the editor
    even without a resolved schema.

The commit path is unchanged: `onCommit(items)` → `Inspector.commit(fieldId, items)`
→ `stack.update({ fields: { [fieldId]: items }, mergeMode: 'merge' })` → the bridge's
`CG UPDATE` ships the structured array (and a re-load's `CG ADD` likewise).

## Tests

- **Unit** (`listField.test.ts`, node env): `toListItems` returns `[]` for
  non-arrays (never `"[object Object]"`) and passes arrays through; `setItemText` /
  `addItem` / `removeItem` / `moveItem` preserve `id` + unknown fields and always
  return arrays; `JSON.stringify` of the result is a real array literal, never
  `"[object Object]"`; a multi-line item `text` keeps its `\n` through
  `setItemText` and the JSON round-trip (never flattened).
- **E2E** (`apps/runtime` Playwright): import a `.vcg` with a ticker `list` field →
  load → select → the Inspector shows an items editor with the item text (NOT
  `"[object Object]"`); edit an item → re-select and confirm the edited text
  round-trips (a stringified array would surface as `"[object Object]"`), proving
  `stack.update` shipped structure end-to-end through the MockRuntime. A second
  spec types a two-line item (pressing Enter for the line break — it must insert a
  newline, not commit) and asserts the `\n` survives into the committed stack
  payload (`stack.snapshot`) and the re-read editor value.

(Repo convention: component rendering + the update round-trip are proven via
Playwright; the structure-preserving logic via vitest. No RTL is added — the repo
has none.)

## Multi-line items (extension — 2026-07-07 live finding)

The PR #243 first cut used a single-line `<input type="text">` per item. On the
live session (CasparCG 2.5.0 `69e8ad5`, post-B-041 two-layer escaping) multi-line
list items came back **flattened**: an HTML text input's value sanitization strips
line breaks, so an item whose `text` contains `\n` (e.g. the original two-line
ticker items) displays with its lines joined, and editing that item commits the
flattened single-line string — the editor destroys the newline even though the
wire (B-041) now carries it correctly in both directions.

**Fix:** the per-item editor becomes a controlled, **auto-growing `<textarea>`**:

- `rows` derives from the value's line count, clamped to a comfortable minimum of
  2 and a maximum of 8 (beyond that it scrolls); `resize: vertical` stays
  available, matching the Inspector's `multiline` branch idiom.
- `\n` is preserved on read (display) AND write (commit) — the pure `listField.ts`
  helpers already preserve arbitrary strings; the input element was the only
  destroyer.
- **Enter inserts a newline** (native textarea behavior — no `Enter → blur`
  key handler like the scalar inputs have, and no wrapping form to submit);
  commit stays on blur. The overall commit semantics are deliberately unchanged —
  staged edits with an explicit Update-button apply is R-003, a separate change.
- Structural ops (add / remove / reorder) and the structured-array round-trip are
  untouched; item rows top-align so the controls stay put as a textarea grows.

## Out of scope

- The Designer list editors (unchanged).
- Any shared component extraction.
- Commit-semantics change (stage locally, apply via the Update button) — R-003.
