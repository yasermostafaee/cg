# Complete Multi-Select Shared Properties + Single-Undo Panel Edits + Thicker Box (D-050)

## Why

D-049 restored input parity but the multi editor still lists only the transform
subset (+ fill), and inspector number edits in multi mode spam the undo stack
with one entry PER KEYSTROKE instead of one per committed edit. This change
exposes the FULL shared-property set, makes a typed edit one undo step (parity
with single selection), and thickens the per-shape box for readability. Stays
keyframe-free.

## What Changes

- **Complete shared properties:** `shared-properties.ts` enumerates each kind's
  FULL editable-property set (mirroring the single inspector's `prop` ids + read
  accessors): the universal set gains `scale.x/y` and the CSS `filter.*` (both on
  `ElementBase`), and `BY_KIND.shape` gains `stroke.color/width/dash`,
  `cornerRadius`, and `shadow.offsetX/offsetY/blur/color`. The intersection then
  yields, for two shapes, every shape property; for a mixed selection, exactly
  the genuine overlap. `MultiSelectSection` renders each shared section
  (Transform / Path Style / Border Radius / Drop Shadow / Filter) with the
  EXISTING single-inspector primitives (`Seg`/`SingleField`, `NumberField`,
  `ColorField`, `FillField`); agree/mixed per property as in D-049.
- **Single-undo panel edits:** the multi number field commits on Enter/blur
  (`RealtimeNumberInput commitMode='blur'` + `deferCommit`), so `onChange` is
  visual-only and `applySharedProperty` runs inside ONE `runAsSingleHistoryEntry`
  per COMMITTED edit — one undo reverts one edit across all selected elements
  (keyframe-free, `writeStaticAnimatable` path). The drag-scrub surface is
  dropped on the multi fields (type-to-edit) so a gesture can't spam history.
- **Thicker box:** `Gizmo.css.ts` `multiBox` border `1px → 2px` (per-shape box
  only; the single `Gizmo` is untouched).
- **Known tech debt (recorded):** the shape property list now lives in TWO places
  (`StyleSection.tsx`'s hand-written sections AND `shared-properties.ts`) — there
  is no central metadata table. A sync comment is added at both sites; a
  central-metadata refactor is a separate quality item (parked near D-035).

## Capabilities

### Modified Capabilities

- `designer-multi-select`: update the shared-property requirement (now the FULL
  common set per kind, not the transform subset), the one-undo group-edit
  requirement (commit on Enter/blur — one history entry per committed edit,
  `onChange` visual-only), and the selection-box requirement (1px thicker). All
  other scenarios preserved verbatim. `designer-animation-timeline` is NOT
  touched (no keyframe-model change).

## Impact

- **Inspector:** `shared-properties.ts` (full descriptor set + `section`/`suffix`
  - sync comment), `MultiSelectSection.tsx` (render all sections, deferred
    commit), `controls.tsx` (`RealtimeNumberInput commitMode`, `NumberField`/
    `ColorField` `deferCommit`/`mixed`), `transform-fields.tsx` (`deferCommit`),
    `StyleSection.tsx` (sync comment).
- **Canvas:** `Gizmo.css.ts` (`multiBox` 2px).
- **Tests:** designer units (full-set intersection homogeneous/mixed; one
  history entry per committed edit + onChange-no-spam via a rendered field;
  keyframe-free) + E2E `multi-select.spec.ts` (full sections + one-undo).
- **Docs:** `features/canvas/README.md` / `state/README.md` if they describe the
  multi editor.

## Out of scope

Group-MOVE undo coalescing and keyframe-aware multi editing (diamonds + one-undo
group drag) — a separate keyframe-aware item. The central-metadata-table refactor
(the duplication above) — a separate quality item.
