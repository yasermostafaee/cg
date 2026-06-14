# Fix Multi-Select Inspector Parity + Units + Per-Shape Boxes (D-049)

## Why

D-041 shipped multi-edit with a bespoke FLAT editor: each shared property is a
raw `<input type="number">` with a text label — no horizontal-drag input, no
section grouping, no unit suffixes (opacity reads as a raw `0–1`, not `%`). The
multi gizmo also draws a single group-spanning bounding box. These are parity
regressions against the single-element inspector the operator already knows.
This change makes the multi editor RENDER like the single inspector and replaces
the group box with a per-shape selection box. Group-edit SEMANTICS are unchanged.

## What Changes

- **Inspector parity (rendering only):** `MultiSelectSection` renders each shared
  property with the SAME primitive the single inspector uses — the
  horizontal-drag number field (`Seg`/`SingleField` → `RealtimeNumberInput` +
  unit suffix + scrub surface) — grouped under the SAME section headers and order
  as single selection (transform props under a `Transform` `CollapseSection`,
  fill under `Path Style` via `FillField`). Achieved by FACTORING the field
  render helpers + the per-property display table out of `TransformSection` into
  a shared `inspector/transform-fields.tsx`, consumed by BOTH the single and
  multi inspectors — no duplicated widget logic, no bespoke flat layout. The
  diamonds (keyframe indicators) are NOT rendered in the multi editor (group
  editing stays static-only, unchanged from D-041).
- **Units:** every united property shows its unit exactly as single selection
  (opacity `%`, rotation `°`, …) by reusing the same `suffix`/`toDisplay`/
  `fromDisplay` metadata. A "mixed" field shows the neutral mixed state through
  the SAME primitive (a new `mixed`/`placeholder` mode on `RealtimeNumberInput`),
  with the unit affordance unchanged.
- **Per-shape selection boxes:** `MultiGizmo` draws an individual selection box
  around EACH selected shape and REMOVES the single union bounding box. Group
  drag (press a selected member → move all, one undo) is unchanged
  (`beginGroupDrag`); a press in empty space behaves like the normal cursor-tool
  rule (it never dragged the group — the union box was already
  `pointerEvents:none`).
- **Unchanged:** `applySharedProperty` → `runAsSingleHistoryEntry`
  (`writeStaticAnimatable`, one undo, keyframe-free), the `sharedEditableProperties`
  intersection + agree/mixed model, selection building, group move/delete. No
  schema change. Keyframe-aware group move is explicitly OUT of scope (separate
  item).

## Capabilities

### Modified Capabilities

- `designer-multi-select`: update the multi-selection-editor RENDERING
  requirement (same primitives + section grouping + units, mixed preserved) and
  the gizmo/selection-box requirement (per-shape boxes, no group box; empty-space
  press is not a group-drag handle). Every other scenario is preserved verbatim.
  `designer-animation-timeline` is NOT touched (no keyframe-model change).

## Impact

- **Inspector:** new `features/inspector/transform-fields.tsx` (shared
  `FieldBody`/`Seg`/`SingleField` with optional `point` + `mixed`, and the
  `TRANSFORM_FIELD_META` display table), `TransformSection.tsx` (consume the
  shared helpers — identical output), `MultiSelectSection.tsx` (rebuilt on the
  shared primitives + grouping + units + `FillField`), `controls.tsx`
  (`RealtimeNumberInput` gains `mixed`/`placeholder`).
- **Canvas:** `features/canvas/Gizmo.tsx` (`MultiGizmo` → per-shape boxes, drop
  the union box) + `Gizmo.css.ts` (a per-shape box class).
- **Tests:** designer unit (jsdom render parity: opacity `%`, Transform grouping,
  mixed primitive, one-undo regression), E2E `multi-select.spec.ts` + fixtures
  updated (per-shape boxes, opacity `%`, empty-space press does not drag).
- **Docs:** `features/canvas/README.md` (gizmo) + `state/README.md` if the
  multi-editor description needs it.

## Out of scope

Keyframe-aware group move (group edits/move stay keyframe-free — a separate
item), group resize/rotate, marquee, align/distribute (all already out per
D-041).
