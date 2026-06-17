# Tasks — layer reorder by dragging a timeline row (D-047)

## 1. Store

- [x] Add `reorderElement(elementId, targetVisualIndex)` to `state/slices/elements.ts`: move the
      element within its sibling set (account for `.reverse()`), renumber that set's `zIndex` so
      top→bottom maps to descending `zIndex`, write back via `withActiveLayers` inside
      `runAsSingleHistoryEntry`; no-op when `target === origin` or the element is not a direct
      layer child.

## 2. Geometry helper

- [x] Add a pure `insertionFromPointer(rowSpans, pointerY)` helper (gap + indicator Y) and a
      `dropTargetIndex(gap, origin)` mapping, in the timeline geometry module.

## 3. Drag interaction

- [x] `TimelineDock`: orchestrate the reorder drag (state: dragging id, indicator Y, target),
      measuring label-row rects; render the horizontal drop indicator in the names column during
      a drag only.
- [x] `ElementRow` (label): thin `onPointerDown` on the name region delegating to the dock
      handler, excluding the chevron + visibility/lock toggles; preserve click→select below the
      ~4px threshold.

## 4. Styles

- [x] Drop-indicator line (`colors.accent`) + a subtle dragging-row affordance in
      `ElementRow.css.ts` / `TimelineDock.css.ts`.

## 5. Tests

- [x] Store: `reorderElement` moves the element and renumbers `zIndex` so displayed top→bottom
      maps to descending `zIndex` (top = highest); render order (ascending sort) matches.
- [x] Store: one undo reverts the reorder.
- [x] Store: dropping at the origin index is a no-op.
- [x] Unit: `insertionFromPointer` / `dropTargetIndex` math.

## 6. Docs

- [x] Update the timeline engine README (`features/timeline/README.md`) with the reorder drag.
- [x] Spec delta validates: `pnpm openspec validate add-layer-reorder-drag --strict`.

## 7. Gate

- [x] Full green gate (uncached) for every touched workspace; mark D-047 `[~]` in
      `docs/prd/designer.md` with the change dir.
