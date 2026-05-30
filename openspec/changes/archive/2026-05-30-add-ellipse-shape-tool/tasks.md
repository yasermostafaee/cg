## 1. Designer state + factory

- [x] 1.1 Add `'ellipse'` to the `DesignerTool` union in `state/store.ts`
- [x] 1.2 Add a `defaultEllipse(id, x, y)` factory in `state/element-defaults.ts` returning a `ShapeElement` with `shape: 'ellipse'` and an equal-width/height (circle) default size

## 2. Designer UI wiring

- [x] 2.1 Add an Ellipse tool button to `features/tools/ToolRail.tsx` (and relabel the rectangle tool "Rectangle")
- [x] 2.2 Handle `tool === 'ellipse'` in `features/canvas/CanvasOverlay.tsx` to create a `defaultEllipse` at the click point and select it

## 3. Tests

- [x] 3.1 Test `defaultEllipse` produces a schema-valid `ellipse` ShapeElement with equal width/height
- [x] 3.2 Test adding an ellipse via the store path selects the new element and it parses against the scene schema

## 4. Validation

- [x] 4.1 `openspec validate add-ellipse-shape-tool --strict` passes
- [x] 4.2 `pnpm --filter @cg/designer typecheck && lint && test` pass; `pnpm --filter @cg/designer build` succeeds
