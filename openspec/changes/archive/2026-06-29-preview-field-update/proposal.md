# Preview field form: explicit Update + optional textarea inputs (D-106)

## Why

Broadcast operators prepare field values and commit them ON CUE (CasparCG
`CG UPDATE`); updating the stage realtime-as-you-type risks partial / flickering
on-air updates mid-keystroke. And long values (tickers / sequences / headlines)
need full visibility, which a single-line input doesn't give.

## What Changes

In the preview modal's data-entry form:

- **Explicit Update (no realtime apply).** Editing a field value no longer
  updates the stage as you type. The input's pending value is decoupled from the
  applied value; changes apply only on an explicit Update — a global **"Update
  all"** (applies every pending field at once) AND a **per-input Update**: each
  editable input applies on its own — a scalar field's input has its own Update,
  and a `list` field (ticker / sequence) gives EACH item input its own per-item
  Update (rather than one Update for the whole list). A field edited but not yet
  applied shows a pending / unapplied indicator, REUSING the amber / dirty
  treatment from D-088/D-089.
- **Optional multi-line textarea inputs** (expandable / auto-grow) so long values
  are fully visible; default to a textarea for typically-long fields (ticker /
  sequence text).

## Capabilities

- `designer-dynamic-fields` (MODIFIED): the "Live field editing in the preview"
  requirement becomes explicit-Update — editing decouples a pending value from the
  applied value and applies only via a global "Update all" or a per-INPUT Update
  (each editable input — a scalar field's input, or a `list` field's individual
  item inputs — applies on its own), with a pending indicator; long values may
  render as an auto-grow textarea.

## Impact

- `apps/designer/src/renderer/features/fields/PreviewModal.tsx` — hold
  pending-vs-applied field state; gate `dispatch.update` behind explicit Update;
  add `onUpdateAll()` + `onUpdateField(path)` + `onUpdateListItem(path, itemId)`
  (merge one list item by stable id, IN PLACE); compute `anyPending`.
- `apps/designer/src/renderer/features/fields/PreviewFieldForm.tsx` (+ `.css.ts`)
  — stage edits into pending state (not realtime); per-field pending indicator
  (amber) + per-input Update button; an "Update all" control; auto-grow textarea
  for long text fields; suppress the single per-field Update for `list` fields.
- `apps/designer/src/renderer/features/fields/ListItemsEditor.tsx` — a per-ITEM
  Update control (preview context), enabled only when that item differs from its
  same-id on-stage item.
- `apps/designer/src/renderer/theme.ts` (optional) — a `pending` amber token
  (`#ffdd40`) reused from the desktop-save dirty indicator.
- No runtime change (the `update` postMessage seam is unchanged; only WHEN it
  fires). No schema change; no version bump.
