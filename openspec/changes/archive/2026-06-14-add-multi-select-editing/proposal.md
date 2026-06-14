# Add Multi-Select Editing (D-041)

## Why

Today only a single element can be moved or have its properties changed; there
is no way to reposition, delete, or recolour several elements at once, even
though their properties largely overlap. The selection state is ALREADY a set
(`selection: ReadonlySet<string>` with `setSelection(ids[])`) — the renderer
just collapses to "single or nothing" everywhere it consumes it. This change
fills the three `selection.size === 1` gaps (inspector, gizmo, drag) and adds
the modifier-click selection building, with NO schema change.

## What Changes

- **Selection building (no schema change):** shift / ctrl(+meta) modifier
  branches in `CanvasOverlay.onPointerDown` and the timeline `ElementRow`
  (label + lane click and the lifespan bar), routed through ONE shared store
  helper `toggleInSelection(id)` so canvas and layers always reflect the same
  set. A modifier-click toggles a hit element in/out; a plain click still
  replaces with `[id]`; a modifier-click on empty canvas is a no-op (does not
  clear). Locked / instance-unit hit rules unchanged.
- **Shared-property model (pure helper):** `sharedEditableProperties(elements)`
  derives each selected kind's editable-property descriptors and INTERSECTS
  them (kind-driven and data-driven — no hardcoded pairwise kind combos),
  computing for each shared property whether the selection AGREES (show the
  value) or DIFFERS (a neutral "mixed" display state, no coercion). At minimum
  the common transform (position X/Y, width, height, rotation, opacity) plus
  `fill` where every selected kind has it.
- **Inspector:** `InspectorPanel` branches on `selection.size` — `0` → existing
  empty/scene state; `1` → existing `StyleSection` (UNCHANGED); `>1` → a new
  `MultiSelectSection` rendering the shared-property editor from the helper,
  reusing the existing inspector input primitives. A "mixed" field shows the
  placeholder and, on edit, applies to ALL. `findSelected` stays the
  `size === 1` accessor; a separate `selectedElements` accessor feeds the multi
  path. No per-keyframe diamonds in the multi editor.
- **Group edit (one undo step):** editing a shared field fans the existing
  per-element store writes over every selected id inside ONE history entry.
  Because `commitAnimatable` KEYFRAMES when a track exists, group edits route
  through the keyframe-free base path (`writeStaticAnimatable` / `updateElement`)
  so v1 group editing only sets static values. The "one entry" is delimited
  with the existing time-coalescing + `markHistoryBoundary` via a minimal
  wrapper (there is no transaction object today).
- **Gizmo + group move:** for `size > 1` a single bounding-box gizmo spanning
  the union of the selected boxes — MOVE ONLY (no resize/rotate handles).
  Dragging any selected element or the box moves ALL selected elements by the
  same delta (reusing the existing drag delta + snapping math, anchored on the
  grabbed element) as one undo step; locked/hidden members are skipped. The
  `size === 1` path keeps today's full Gizmo (resize/rotate) and keyframe-aware
  drag untouched (D-006 preserved).
- **Delete:** the existing multi-aware `deleteSelection` (D-023) already removes
  the whole set in one step behind the input/textarea/contentEditable guard —
  kept intact, verified by test.

## Capabilities

### New Capabilities

- `designer-multi-select`: building a multi-selection with modifier clicks
  across canvas + layers, the multi-selection affordances and union
  bounding-box gizmo, group move by a shared delta in one undo step, the
  shared-property intersection + mixed-state editor with one-undo group edits,
  group delete, and single-selection parity (no regression).

### Modified Capabilities

None. `designer-animation-timeline` is deliberately NOT modified — group editing
is keyframe-free in v1 (no keyframe-model change). `designer-shapes` is NOT
modified — single-element move/resize via its gizmo is the `size === 1` path,
unchanged.

## Impact

- **Designer state:** `state/slices/selection.ts` (`toggleInSelection`),
  `state/store-core.ts` (a `runAsSingleHistoryEntry` wrapper over
  `markHistoryBoundary`), a new pure `features/inspector/shared-properties.ts`
  helper, a `selectedElements` accessor.
- **Canvas:** `features/canvas/CanvasOverlay.tsx` (modifier select + multi
  gizmo render + group move), `features/canvas/Gizmo.tsx` (a move-only
  `MultiGizmo` + union-box geometry).
- **Inspector:** `features/inspector/InspectorPanel.tsx` (`size` branch) + new
  `features/inspector/MultiSelectSection.tsx`.
- **Timeline:** `features/timeline/ElementRow.tsx` (modifier select on both
  click handlers + lifespan bar).
- **Tests:** designer units (toggle, intersection homogeneous/mixed, agree/mixed,
  one-undo group edit / move / delete, reduce-to-one, clear), E2E
  `apps/designer/tests/e2e/multi-select.spec.ts`.
- **Docs:** `apps/designer/src/renderer/state/README.md` and the canvas feature
  `README.md` (selection-set-driven multi-select + the shared-property seam).

## Out of scope (v1)

Marquee / rubber-band selection, group resize/rotate (bounding-box scaling),
group keyframe add/edit, and aligning/distributing the selection. Also: group
MOVE of an animated member writes its STATIC base (keyframe-free), so it may not
visibly move at frames a position track dominates — recorded in `design.md`.
