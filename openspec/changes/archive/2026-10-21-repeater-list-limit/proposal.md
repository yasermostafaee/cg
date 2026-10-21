# A repeater's list stops at its max items, in the Preview form and in CG Control (RUN-NEXT-VERSION-02 Q3, Q4)

## Why

`B-106` taught the repeater's own Rows editor its row limit: the page stamps at most `maxItems` rows, so Add item is
withheld there and rows past it read "not shown". Two editors of the SAME list did not know: the Designer's Preview
data form, and CG Control's Inspector — an operator could add rows the page would never show, with nothing said.
`REPORT-RUN-NEXT-VERSION-01` asked both (Q3, Q4); the owner accepted: one prop on the shared editor, and the GDD carries
`maxItems` so CG Control stops the operator there (Q4 its own FULL-lane item).

## What Changes

- **One derivation** (`@cg/shared-schema`): `listFieldMaxItems(doc, fieldId)` — the row limit of the repeater a list
  drives (`repeater-items`), the smallest if several; `withListLimits` stamps it on an aggregate's list fields.
- **Q3 — the Designer's Preview form** reads the stamped limit: its list editor (the shared `ListItemsEditor`) withholds
  Add item at the limit and flags rows past it, as the Rows section does.
- **Q4 — the GDD** writes `maxItems` on the repeater's array property (JSON Schema's keyword), and **CG Control's
  import** stamps `maxItems` on the template's list field (a derived marker, like a countdown target's), so the
  Inspector withholds Add item at the limit and states the count (`3 / 6`).

## Impact

- **Specs:** `designer-repeater-element` (ADDED × 1), `runtime-ui` (ADDED × 1).
- **Code:** `@cg/shared-schema` (`ListFieldSchema.maxItems`, optional and derived; `list-limits.ts`), `@cg/vcg-format`
  (GDD), the Designer's Preview modal and form, CG Control's import and list editor.
