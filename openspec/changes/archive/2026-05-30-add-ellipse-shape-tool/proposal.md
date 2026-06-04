## Why

The Designer can drop a rectangle on the canvas but has no way to add a
circle or ellipse — even though the scene schema (`ShapeElement.shape`) and
the broadcast runtime (`@cg/template-runtime`) already model and render
`ellipse`. Operators building lower-thirds and bugs frequently need round
plates and dots, and today they can't create one directly.

## What Changes

- Add an **Ellipse** tool to the Designer tool rail, alongside the existing
  rectangle (Shape) tool.
- Clicking the canvas with the Ellipse tool creates an `ellipse` shape
  element at the click point with a sensible default size (a circle the
  operator can resize into any ellipse).
- The new shape moves and resizes through the existing selection gizmo — no
  new transform logic (shapes are transform-driven like every element).
- Relabel the existing rectangle tool to "Rectangle" for clarity now that
  there are two shape tools (display-only; the `shape` tool id is unchanged).
- No schema or runtime changes: `ellipse` is already a valid `ShapeElement`
  kind and `@cg/template-runtime` already renders it via `border-radius:50%`.
  The Inspector already lets you switch a shape's kind (rect / rounded-rect /
  ellipse).

## Capabilities

### New Capabilities

- `designer-shapes`: authoring vector shapes (rectangle, ellipse) on the
  Designer canvas — adding them via tools, and moving/resizing them.

### Modified Capabilities

<!-- None — no existing spec captures shape authoring yet, and neither the
     schema nor the runtime behavior changes. -->

## Impact

- **Code:** `apps/designer/src/renderer` only — `state/store.ts`
  (`DesignerTool` union), `state/element-defaults.ts` (new `defaultEllipse`),
  `features/tools/ToolRail.tsx` (new tool button), and
  `features/canvas/CanvasOverlay.tsx` (create on click).
- **Unchanged:** `@cg/shared-schema` and `@cg/template-runtime` (ellipse
  already supported), the Inspector, and all storage/export paths.
- **Tests:** `element-defaults` (ellipse factory) and store/creation coverage.
- **Dependencies:** none added.
