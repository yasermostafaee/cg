# Tasks — add-multi-select-editing

## 1. Store — selection + undo batching (no schema change)

- [x] 1.1 `toggleInSelection(id)` on the selection slice: add when absent /
      remove when present (immutable Set), dropping the keyframe selection
      unless the kept element survives (mirror `setSelection`)
- [x] 1.2 `runAsSingleHistoryEntry(fn)` in `store-core.ts` (exposed on
      `designerStore`): `markHistoryBoundary()` → run `fn` → `markHistoryBoundary()`
      so a synchronous fan-out collapses to ONE undo entry, isolated from
      neighbours
- [x] 1.3 `selectedElements(scene, selection)` accessor for the multi path
      (`findSelected` stays the `size === 1` accessor, untouched)

## 2. Shared-property intersection helper (pure)

- [x] 2.1 `features/inspector/shared-properties.ts`: an `EDITABLE_BY_KIND`
      descriptor table (`{ key, label, kind, prop, read, step?/min? }`) and
      `sharedEditableProperties(elements)` that intersects descriptors across
      the selected kinds and computes agree (`{ value }`) vs differ
      (`{ mixed: true }`) per shared property — no hardcoded pairwise kind
      combos; universal transform set + opacity, fill where every kind has it

## 3. Canvas — modifier select + multi gizmo + group move

- [x] 3.1 `CanvasOverlay.onPointerDown`: modifier (shift/ctrl/meta) on a hit →
      `toggleInSelection`, no drag; modifier on empty → no-op; plain click on a
      multi-selection member → group drag (collapse to `[id]` only on click);
      plain click otherwise → `setSelection([id])` + drag (today)
- [x] 3.2 `Gizmo.tsx`: a move-only `MultiGizmo` spanning the union of selected
      elements' effective boxes (no resize/rotate handles)
- [x] 3.3 Group move: capture each movable member's start (visible & !locked),
      reuse the drag delta + snapping anchored on the grabbed element, apply the
      same delta to all via `writeStaticAnimatable` (keyframe-free); one undo
      entry via `markHistoryBoundary` at gesture start/end; `size === 1` drag
      (keyframe-aware `commitAnimatable`) untouched

## 4. Timeline — modifier select on layer rows

- [x] 4.1 `ElementRow` label `onClick`, lane `onClick`, and the lifespan-bar
      pointer-down: modifier → `toggleInSelection(id)` else `setSelection([id])`
      (plain click still replaces); canvas + layers reflect one set

## 5. Inspector — multi-selection editor

- [x] 5.1 `InspectorPanel` branches on `selection.size`: `0` → empty/scene; `1`
      → existing `StyleSection` (UNCHANGED); `>1` → `MultiSelectSection`
- [x] 5.2 `MultiSelectSection.tsx`: render the shared-property editor from
      `sharedEditableProperties`, reusing the existing inspector input
      primitives; a mixed field shows a neutral placeholder and on edit applies
      to ALL selected ids inside `runAsSingleHistoryEntry` via
      `writeStaticAnimatable` / `updateElement` (no keyframe diamonds)

## 6. Tests — store / unit

- [x] 6.1 `toggleInSelection` add/remove; plain vs modifier click semantics
- [x] 6.2 `sharedEditableProperties` homogeneous (full set) + mixed (subset);
      agree-vs-mixed computation
- [x] 6.3 group edit applies to all in ONE undo entry (a single undo reverts the
      whole group, leaving setup intact)
- [x] 6.4 group move applies the delta to all, skips locked/hidden, ONE undo
      entry; group delete removes all in one step
- [x] 6.5 reducing to one restores the single inspector accessor; clearing →
      empty state

## 7. E2E + docs + gate

- [x] 7.1 `apps/designer/tests/e2e/multi-select.spec.ts` (+ shift/ctrl-click and
      multi-drag fixture helpers): 3 shapes → shift-click two → both selected +
      one bounding box → drag → both move (one undo reverts both) → edit fill →
      both recolor → add a text, select text+shape → shared-only with a mixed
      value → Delete removes the selection; run via `pnpm test:e2e`
- [x] 7.2 Engine doc-sync: `state/README.md` (selection set drives multi-select;
      shared-property seam) + canvas `README.md` (multi gizmo / selection model)
- [x] 7.3 Full green gate (format:check + typecheck + lint + test + build), test
      task uncached once (`turbo --force`);
      `pnpm openspec validate add-multi-select-editing --strict`
