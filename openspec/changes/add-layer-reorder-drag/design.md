# Design — layer reorder by dragging a timeline row (D-047)

## Model recap (from recon)

- `Element.zIndex` (`z.number().int()`); the runtime paints a layer's children sorted ASCENDING
  by `zIndex` (`scene-builder.ts:103`), so higher `zIndex` = later in DOM = front-most.
- All elements are created with `zIndex: 0`, so today paint order == array order (stable sort).
- The timeline names column lists rows as `const elements = [...flattenElements(scene)].reverse()`
  (`TimelineDock.tsx`): top row = last in flatten = front-most.
- `flattenElements` is NOT a flat single-sibling list — it walks every `scene.layers` entry and
  recurses into `container` children. `locate(scene, id)` finds an element among a layer's DIRECT
  children only (it does not recurse into containers).

## Scope decision (STEP 0.1)

Because nesting (containers) and multiple layers exist in the model, the reorder is scoped to the
dragged element's OWN sibling set, as the brief directs ("if nesting exists, scope to reordering
within the same parent only"; "do NOT build cross-layer/cross-parent moves"). The algorithm below
filters the moved visual order down to the element's siblings, so a drop that would land outside
the sibling block clamps to the nearest in-block position — never a cross-parent move. Dragging a
nested container child (not found by `locate`) is a no-op. In the only UI-reachable topology — one
layer of direct children (there is no UI to add layers or create containers) — the sibling set is
the entire list, so this is identical to the brief's "renumber the whole list" intent.

## `reorderElement(elementId, targetVisualIndex)`

`targetVisualIndex` is the element's destination position in the displayed top→bottom order
(move-to-index semantics). Accounting for the `.reverse()`:

1. `visual = [...flattenElements(scene)].reverse()` — front→back ids (timeline order).
2. `origin = visual.findIndex(id === elementId)`; bail if not found.
3. `target = clamp(round(targetVisualIndex), 0, visual.length - 1)`; if `target === origin`, NO-OP
   (return before any `set`).
4. Move in visual space: splice the element out of `origin` and back in at `target`.
5. Restrict to siblings: `siblingIds = new Set(found.layer.children.map(id))` (via `locate`);
   `newFrontToBack = movedVisual.filter(id ∈ siblingIds)`.
6. Array/paint order is back→front, i.e. the reverse: `newChildren = [...newFrontToBack].reverse()`.
7. Renumber: `newChildren.map((el, i) => ({ ...el, zIndex: i }))` — index 0 (back) lowest, last
   (front) highest. This makes paint order (ascending `zIndex`) == array order, and the timeline
   order (`reverse(flatten)`) == the intended top→bottom order. It also fixes the all-zero state.
8. Write back the one layer via `withActiveLayers` inside `runAsSingleHistoryEntry` → exactly one
   `set`, one undo entry.

This keeps both the array order AND `zIndex` consistent, so the canvas/preview/export (zIndex
sort) and the timeline (array order) agree.

## Insertion-index geometry (pure helper)

Interaction is hard to unit-test, so the math is extracted into a pure helper and the DOM
measurement stays thin in the React handler. Rows vary in height (an expanded element adds
property track rows beneath its label), so the handler measures each LABEL row's
`getBoundingClientRect()` (each label carries `data-element-id`) rather than assuming a fixed row
height.

`insertionFromPointer(rowSpans, pointerY)` where `rowSpans` is the label rows' `{ top, height }`
in container-Y, visual order:

- `gap` = count of rows whose vertical midpoint is above `pointerY` ⇒ gap ∈ `[0, n]` (0 = above
  the first row, n = below the last).
- `indicatorY` = `rowSpans[gap].top` (or the bottom of the last row when `gap === n`).

The handler converts the gap to the move-to target: `target = gap > origin ? gap - 1 : gap`
(removing the dragged row shifts the rows below it up by one). If `target === origin`, the drop is
a no-op.

## Pointer drag (mirrors the existing lifespan-bar / ruler drags)

- `onPointerDown` on the row's name region (the label cell, excluding chevron + visibility/lock
  toggles, which `stopPropagation`). Record `startY`.
- On `pointermove`, once `|y - startY| > 4px`, begin the drag: `setPointerCapture`, set the
  dragging state, and start updating the indicator; below the threshold the click→select handler
  stands (a plain click still selects).
- While dragging, recompute `gap` + `indicatorY` from the measured row spans; render the indicator.
- On `pointerup` / `pointercancel`: if `target !== origin`, call `reorderElement`; clear the
  indicator and release capture. Listeners are added on `window` (like the lifespan drag) so the
  gesture survives the pointer leaving the row.

The drag is orchestrated from `TimelineDock` (it owns the `elements` list and the names-column
container where the indicator overlay renders); `ElementRow`'s label delegates its `onPointerDown`
to a thin dock-provided callback, keeping the row component lean.

## History

`reorderElement` wraps its single `set` in `runAsSingleHistoryEntry` (leading + trailing
`markHistoryBoundary`), so the reorder is exactly one isolated undo entry regardless of any edit
that preceded it inside the 300 ms coalescing window — matching the box-radius migration precedent.
