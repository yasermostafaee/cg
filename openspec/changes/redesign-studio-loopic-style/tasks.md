## 1. Store + bridge

- [x] 1.1 Add `view: 'landing' | 'studio'` to the store (default `'landing'`) + `setView()`; `setScene(scene, path)` flips view to `'studio'` when scene is non-null, `'landing'` when null
- [x] 1.2 Add `'hand'` to the `DesignerTool` union
- [x] 1.3 Extend `ProjectsNewChannel` schema with optional `resolution` + `frameRate`; thread through `bridge.projects.create` and `ProjectStore.newScene`

## 2. Landing view + New Project modal

- [x] 2.1 `features/shell/LandingView.tsx` — full-viewport screen with starter grid, recent list, and a "New project" button
- [x] 2.2 `features/shell/NewProjectModal.tsx` — fixed-position modal: name input, resolution preset radio (1920×1080, 1280×720, 1080×1920) + custom W×H inputs, frame rate select, template type, Confirm/Cancel
- [x] 2.3 Wire LandingView + modal into `App.tsx`; route on `store.view`

## 3. Studio top toolbar + hand tool

- [x] 3.1 `features/shell/TopToolbar.tsx` — horizontal toolbar with six tool buttons (cursor, rect, text, ellipse, hand, image) and a "back to projects" affordance
- [x] 3.2 Remove the side `ToolRail` from the studio shell; render `TopToolbar` above the canvas
- [x] 3.3 Handle `tool === 'hand'` in `CanvasOverlay`: pointer drag updates the outer-container scroll instead of selecting/creating; cursor flips to `grab`

## 4. Canvas zoom + wheel

- [x] 4.1 Replace the hardcoded `SCALE = 0.5` in `CanvasArea` with state `zoom` (default 0.5)
- [x] 4.2 Add canvas controls header with `−` / `+` / `1×` / `⛶` (fit) buttons + zoom readout
- [x] 4.3 `wheel` listener on the canvas outer (non-passive): with `ctrlKey` → zoom + preventDefault; without → native overflow scroll runs
- [x] 4.4 Hand-tool `onPan` callback adjusts `scrollLeft` / `scrollTop` of the outer container

## 5. Timeline — right-click remove

- [x] 5.1 `TrackRow` keyframe diamond gets `onContextMenu` → `preventDefault` + `removeKeyframe`
- [x] 5.2 Empty lane swallows context menu (no browser menu)

## 6. Drop the docked LibraryPanel

- [x] 6.1 Remove `<LibraryPanel>` from the studio shell in `App.tsx`
- [x] 6.2 Starter / recent rendering moved into `LandingView`

## 7. Tests

- [x] 7.1 `store.view` defaults, `setScene(scene)` flips to `'studio'`, `setScene(null)` flips back to `'landing'`, `setView` flips explicitly
- [x] 7.2 `ProjectStore.newScene(name, type, { resolution, frameRate })` writes the overrides; no options → v1 defaults

## 8. Validation

- [x] 8.1 `pnpm openspec validate redesign-studio-loopic-style --strict` passes
- [x] 8.2 `pnpm --filter @cg/designer typecheck && lint && test` pass (80/80)
- [x] 8.3 `pnpm --filter @cg/designer build` succeeds
