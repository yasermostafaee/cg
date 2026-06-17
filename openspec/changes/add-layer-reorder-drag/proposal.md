# Reorder layers by dragging a timeline row (D-047)

## Why

There is no way to change the stacking order (z-stack) of elements today. Every element is
created with `zIndex: 0` (`element-defaults.ts`), and the runtime paints a layer's children
sorted **ascending by `zIndex`** (`scene-builder.ts`), so with all-zero `zIndex` the paint order
is just the array order via a stable sort. The timeline names column lists rows top→bottom via
`[...flattenElements(scene)].reverse()` (top row = front-most). Operators need to drag a row
up/down to bring an element forward or send it back — the standard layer-reorder gesture.

## What Changes

- **Store (`state/slices/elements.ts`):** add `reorderElement(elementId, targetVisualIndex)`,
  where `targetVisualIndex` is the element's destination position in the timeline's displayed
  top→bottom order. It moves the element within its OWN sibling set and renumbers that set's
  `zIndex` so the displayed top→bottom order maps to DESCENDING `zIndex` (top row = highest =
  front-most), writing back via the existing `withActiveLayers` / `set` pattern wrapped in
  `runAsSingleHistoryEntry` (exactly one undo entry). Renumbering the whole sibling set fixes
  the all-zero state. Dropping at the origin index is a no-op.
- **Pointer-based row drag (`ElementRow` label + `TimelineDock`):** a pointer drag on the row's
  name region (NOT the chevron, visibility/lock toggles, or the lifespan bar). Below a ~4px
  threshold the existing click→select stands; past it the drag starts (`setPointerCapture`) and
  a horizontal drop-indicator line is shown at the target gap (above/below the hovered row).
  On pointer up, if the insertion index differs from the origin it calls `reorderElement`; else
  no-op. Both panes derive from the same `elements` list, so the canvas/right-pane update with it.
- **Drop indicator:** a thin horizontal accent line (`colors.accent`), visible only during an
  active drag.

## Scope

Single-row reorder WITHIN one sibling set (the element's parent layer's direct children).
`flattenElements` spans all layers and recurses container children, so the reorder is scoped to
the dragged element's own siblings and clamps any cross-parent drop back into that set — it never
moves an element across layers or in/out of a container. In the only topology reachable through
the UI (one layer of direct children, since there is no UI to add layers or create containers)
this is the whole list.

## Capabilities

### Modified Capabilities

- `designer-animation-timeline`: a new requirement — dragging a timeline layer row up/down
  reorders the element within its sibling set (changing the z-stack), with a drop indicator,
  a click/drag threshold, and one-undo restore.

## Impact

- **Designer:** `state/slices/elements.ts` (`reorderElement`); in `features/timeline/` the drag
  and indicator wiring (`ElementRow.tsx`, `TimelineDock.tsx`), the indicator and dragging styles
  (`ElementRow.css.ts`, `TimelineDock.css.ts`), and the pure insertion-index helpers
  (`timeline-geometry.ts`).
- **Schema / runtime:** none — `zIndex` already exists and the runtime already sorts by it.
- **Tests:** store tests for `reorderElement` (move + renumber + render order + one-undo + origin
  no-op) and a unit test for the insertion-index helper.
- **Docs:** the spec delta below + the timeline engine README.

## Out of scope

Whole-multi-selection drag; cross-layer / cross-parent (in/out of container) moves; edge
auto-scroll while dragging; reordering nested container children (out of the single-sibling-set
scope — such a drag is a no-op).
