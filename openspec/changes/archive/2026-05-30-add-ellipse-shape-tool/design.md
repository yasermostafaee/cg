## Context

`ShapeElement.shape` already includes `ellipse`, and `@cg/template-runtime`'s
scene-builder already renders it (`border-radius: 50%`). The Inspector already
exposes a shape-kind selector. The only gap is in the Designer authoring layer:
the tool rail offers a rectangle tool but no way to drop an ellipse directly.
This is a renderer-only change in `apps/designer`.

## Goals / Non-Goals

**Goals:**

- One-click way to add an ellipse to the canvas.
- The ellipse moves/resizes like any other element (existing gizmo).
- Default to a circle so the operator starts symmetric.

**Non-Goals:**

- No `@cg/shared-schema` or `@cg/template-runtime` changes (ellipse already works).
- No new shape kinds (polygon/path stay out of the UI for now).
- No pixel-precise elliptical hit-testing — bounding-box selection is fine.

## Decisions

- **Add a distinct `'ellipse'` tool** to the `DesignerTool` union and the tool
  rail, rather than a kind toggle on the existing tool. Rationale: a visible
  second tool is the most discoverable one-click "add a circle" affordance and
  matches the existing per-tool model (text/shape/image). Alternative — a
  single "shape" tool plus an inspector kind switch — already exists for
  _converting_ a shape, but it's not discoverable for _creating_ one.
- **Default size 200×200 (a circle).** Symmetric start; the operator resizes
  into an ellipse. Reuses `defaultShape`'s structure via a new `defaultEllipse`
  factory.
- **Relabel the rectangle tool "Rectangle"** (display only; tool id stays
  `'shape'`) so two shape tools aren't both called "Shape".

## Risks / Trade-offs

- [Bounding-box selection means the corners outside the ellipse are still
  "inside" its hit box] → Acceptable for v1; standard in most editors. Can add
  elliptical hit-testing later if operators ask.
- [Two shape tools slightly grow the rail] → Minor; still well under a crowded
  toolbar.
