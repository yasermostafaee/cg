# Design — add-multi-select-editing

## D1. Selection building — one set, one toggle path

`selection` is already `ReadonlySet<string>` and `setSelection(ids[])` is
array-based. The only new primitive is `toggleInSelection(id)` on the selection
slice: add `id` when absent, remove it when present, replacing the set
immutably (and dropping the keyframe selection unless the kept element survives,
exactly like `setSelection`). Both surfaces call ONE path:

- **Canvas** (`CanvasOverlay.onPointerDown`, cursor tool): on a hit, a modifier
  (shift OR ctrl/meta) → `toggleInSelection(hit.id)` and NO drag; a plain click
  on a hit that is NOT already part of a multi-selection → `setSelection([id])`
  then begin drag; a plain click on a hit that IS a member of the current
  multi-selection → begin a GROUP drag (collapse to `[id]` only if it was a
  click, not a drag); a modifier-click on empty space → no-op; a plain click on
  empty → `setSelection([])` (today).
- **Timeline** (`ElementRow` label `onClick`, lane `onClick`, and the lifespan
  bar pointer-down): the same modifier check → `toggleInSelection(id)` else
  `setSelection([id])`.

Because both write the same store set, the canvas affordances and the
highlighted layer rows are always derived from one source — sync is structural,
not synchronized.

## D2. Shared-property intersection — kind-driven, data-driven

A pure helper `sharedEditableProperties(elements): SharedProperty[]` with NO
hardcoded pairwise kind combinations:

1. For each element, build its editable-property descriptor list from a shared
   `UNIVERSAL` set (transform + opacity, on every kind) plus a per-kind `BY_KIND`
   table (e.g. `fill.color` for shapes, `text.color` for text). A descriptor is
   `{ key, label, kind: 'number' | 'color', prop: AnimatableProperty, read(el),
step?/min? }` — `prop` is the existing animatable-property id the write path
   already understands; `read(el)` samples the element's CURRENT static value.
2. INTERSECT the descriptor `key` sets across all selected elements (a property
   is shared iff EVERY selected element's kind has it).
3. For each shared descriptor compute `agree` by reading the value off every
   element: all equal → `{ value }`; otherwise → `{ mixed: true }` (no
   coercion).

The universal set (on every kind via `transform` / `opacity`) is `position.x`,
`position.y`, `size.w`, `size.h`, `rotation`, `opacity`. `fill.color` is on the
shape kind; `text.color` on text; etc. A mixed text+ellipse selection therefore
intersects down to exactly the transform set; two rectangles keep the full
shape set including `fill`. "mixed" is a DISPLAY state in the inspector input,
never a schema value.

## D3. One-undo group edit — why static writes, and how "one entry" works

There is NO transaction object in the store. Undo grouping is TIME-COALESCED in
`store-core.set()`: a scene write pushes the prior scene onto `past` only when
`now() - lastSnapshotAt > 300ms`, and `markHistoryBoundary()` forces the next
write to snapshot fresh. So N synchronous writes already collapse to one entry —
but only if isolated from neighbours. The minimal wrapper:

```
runAsSingleHistoryEntry(fn):
  markHistoryBoundary()   // the first inner write snapshots → isolates from prior edits
  fn()                    // synchronous per-element writes coalesce → ONE entry
  markHistoryBoundary()   // the next edit starts fresh → does not fold in
```

A group edit wraps the fan-out in this; one `undo()` reverts the WHOLE group and
leaves any prior setup intact (deterministic in tests, no reliance on wall-clock
gaps).

`commitAnimatable(id, prop, value)` KEYFRAMES when a track exists for that
property (timeline.ts) — so it cannot be used for keyframe-free group edits.
Group edits therefore call `writeStaticAnimatable(id, prop, value)` (the
existing base-write that bypasses the keyframe branch) for animatable
numeric/colour props, and `updateElement` for the rest. This keeps v1 group
editing strictly static and leaves `designer-animation-timeline` untouched.

## D4. Multi gizmo + group move — union box, move only, same delta

For `size > 1`, `CanvasOverlay` renders a `MultiGizmo` instead of the
single-element `Gizmo`: the union of each selected element's EFFECTIVE box at
the current frame (`effectiveTransformAt`), drawn as a move-only frame (no
resize/rotate handles). Group move:

- Capture each MOVABLE member's start position (`effectiveTransformAt`); a
  member is movable iff it exists, is `visible`, and not `locked` (skip the
  rest — matches single-drag, which never drags a locked element).
- Reuse the existing drag delta + snapping math, but anchor SNAPPING on the
  grabbed element only, then apply the SAME (snapped) `dx/dy` to every movable
  member so relative offsets are preserved.
- Write positions with `writeStaticAnimatable(id, 'position.x'/'position.y', …)`
  — keyframe-free (D3). `markHistoryBoundary()` at drag start, per-tick writes
  coalesce, `markHistoryBoundary()` at drag end → ONE undo entry for the gesture.

The `size === 1` write path is deliberately NOT unified with this: single drag
keeps calling `commitAnimatable` (keyframe-aware, D-006). Splitting the write
path is what lets group ops stay keyframe-free WITHOUT regressing single-element
animation authoring. Trade-off (recorded): group-moving an element that has a
position track writes its static base, which may not visibly shift it at frames
the track dominates — acceptable for v1 (group keyframe edit is out of scope).

## D5. Inspector branching + accessors

`InspectorPanel`: after the keyframe-inspector branch, compute
`findSelected(scene, selection)` (UNCHANGED — `size === 1` only). When it is
`null`: if `selection.size > 1` render `<MultiSelectSection>`, else the existing
`SceneInspector`. When it is non-null render the existing `ElementInspector`
(StyleSection untouched). A separate `selectedElements(scene, selection)`
accessor returns the selected elements (top-level layer children) for the multi
path — `findSelected` is not overloaded.

## D6. Out of scope (v1) + parity

Out: marquee/rubber-band, group resize/rotate, group keyframe add/edit,
align/distribute. Parity guarantees pinned by tests: `size === 1` inspector /
gizmo / drag identical to today; reducing to one restores the single inspector;
clearing shows the empty state; `deleteSelection` (D-023) kept intact behind the
typing guard.
