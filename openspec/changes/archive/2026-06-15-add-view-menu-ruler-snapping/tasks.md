## 1. Store

- [x] 1.1 Add `rulerVisible` (default false), `snappingEnabled` (default true),
      transient `snapGuides` to state + initial state
- [x] 1.2 `toggleRuler`, `toggleSnapping` (clears guides), `setSnapGuides`
      (no-op when already clear)

## 2. View menu

- [x] 2.1 `TopToolbar` — real View dropdown ('view' in openMenu); Help stays a
      disabled placeholder
- [x] 2.2 `ToggleMenuItem` with a leading checkmark; wire Ruler/Snapping to the
      store toggles

## 3. Snapping

- [x] 3.1 `CanvasOverlay.beginDrag` — precompute canvas + other-element snap
      targets; snap the dragged box's near/center/far anchors within ~6px/zoom;
      publish `snapGuides`; clear on pointer-up; gated on `snappingEnabled`
- [x] 3.2 Render magenta guide lines (scene→screen via zoom) in the overlay

## 4. Ruler

- [x] 4.1 `CanvasArea` — measure `rulerOrigin` (stage vs viewport) via
      ResizeObserver + scroll/resize; recompute on zoom / scene / load
- [x] 4.2 `CanvasRuler` — top + left ticks/labels, zoom-adaptive step, scene
      `(0,0)` at the origin; rendered only when the ruler is on

## 5. Ruler guides

- [x] 5.0 Store `guides` state + `addGuide` / `setGuidePos` / `removeGuide`
      (reset on scene change); elements snap to guides in `beginDrag`
- [x] 5.0a Drag from the top/left ruler to create a guide; guide lines render
      aligned to the canvas, are draggable to reposition, and removable by dropping
      off-canvas or double-click

## 6. Tests + gate

- [x] 5.1 `apps/designer/tests/store-view-prefs.test.ts` — defaults, toggles,
      guide set/clear
- [x] 5.2 Green gate: `typecheck` + `lint` + `test` + `build` for `@cg/designer`
- [x] 5.3 `pnpm openspec validate add-view-menu-ruler-snapping --strict`
