# Canvas editor — the Designer's editing surface

How the Designer's interactive canvas is **built** + its contracts, and the
**extension points** for adding tools / handles / snap rules. For the platform-wide
picture see [`docs/engines/overview.md`](../../../../../../docs/engines/overview.md);
for the render engine it overlays, see
[`@cg/template-runtime`](../../../../../../packages/template-runtime/README.md).

- **This doc = _how it's built_.** The behavioural contract (WHEN/THEN) lives in the
  OpenSpec specs/changes (`designer-shapes`, `designer-animation-timeline`,
  `add-drill-into-composition`, `add-view-menu-ruler-snapping`) — don't duplicate it.
- **Pure math is unit-tested; the React layer is E2E-tested** (see
  [Testing](#testing)).

## Tech: SVG/DOM, not a canvas library

There is **no `<canvas>` and no Konva/Fabric**. The editing surface is plain
**DOM**: the live graphic is a `template-runtime` preview in an `<iframe>`, and a
**transparent `<div>` overlay** on top captures pointer input and draws the
selection gizmo + guides as absolutely-positioned DOM. This is deliberate — see the
next section.

## Single source of render — the editor overlays the runtime

```
CanvasArea  ── host: zoom / pan / rulers / guides ────────────────────────┐
  ├─ <iframe srcDoc=…>   the LIVE @cg/template-runtime preview (the render) │
  │      ▲  postMessage: scene-replace · scrub · editing-text · asset-urls  │
  └─ CanvasOverlay  ── transparent input layer (steals pointer events) ─────┤
        ├─ hit-test + tool dispatch (select / create / pan / drill)         │
        ├─ Gizmo        resize / rotate handles  ─┐                         │
        └─ TextEditor   inline text editing        │ math →  geometry.ts    │
                                                   ▼ (pure, unit-tested)    │
                                   hit-test.ts · drill.ts · geometry.ts      ┘
```

The editor **does not render scene elements itself** — the iframe runs the **real
runtime**, the same code that powers preview/export/playout. So what you edit is
exactly what airs (no editor-only renderer to drift). The overlay only adds the
_editing affordances_ (selection frame, handles, guides) and translates pointer
gestures into **store mutations**, which flow back to the iframe as a
`scene-replace` postMessage (rAF-throttled so a 60 Hz drag never floods it).

`CanvasArea` owns the zoom (0.1–4×, Ctrl+wheel + buttons + auto-fit), hand-pan
(scrolls the container), and the pinned rulers + draggable guides.

## Coordinate spaces

Three spaces; the conversions are the crux of every interaction:

| Space               | Unit                   | Notes                                                |
| ------------------- | ---------------------- | ---------------------------------------------------- |
| **screen / client** | viewport px            | raw pointer events (`clientX/Y`)                     |
| **scene**           | composition px         | what the schema stores; the gizmo/hit-test work here |
| **element-local**   | px in the unscaled box | origin at `position`, spans `0..size.w × 0..size.h`  |

- **screen → scene:** `screenToScene(clientX, clientY, stageRect, zoom)` =
  `(client − stageOrigin) / zoom`. Used by both the overlay (placement/selection)
  and `CanvasArea` (guides).
- **scene ↔ element-local:** the runtime maps local→scene with **`Scale·Rotate`
  about the element's `anchor`** (CSS `transform-origin`, a 0..1 fraction). The
  editor matches it exactly: `localToScene` (geometry) goes forward;
  `inverseToLocal` (hit-test) inverts it (undo scale, then rotation about the anchor
  pivot) so hit-testing and drilling reason in the element's own frame.

Everything hit-tests at the **visually-effective transform for the current frame**
(`effectiveTransformAt`), so animated elements are picked where the operator sees
them, not at their static base.

## The gizmo (handles + transform math)

`Gizmo.tsx` renders the selection frame: four corner squares, four edge strips,
four outer rotation zones, and a centre pivot — all rotated with the element. The
pointer gestures live in `Gizmo.tsx` (they read the store and run the
`pointermove`/`up` loop); the **math is pure in `geometry.ts`**:

- **Resize** — `computeResize(t, handle, pointerScene)`. The opposite corner is
  fixed (`RESIZE_CFG`); the new size is the pointer→fixed-corner vector **projected
  onto the element's local axes** (so resize works correctly when rotated), clamped
  to `MIN_SIZE`; the top-left is then recomputed so the fixed corner doesn't move.
  Edge handles free one axis only.
- **Rotate** — `pivotClientFromGrab` recovers the pivot's client position from the
  grabbed corner; `computeRotationAngle` adds the change in cursor angle (`atan2`
  about the pivot) to the start angle, snapping to the nearest 15° within `SNAP_DEG`
  (Shift = free).
- Resize/rotate commit via `designerStore.commitAnimatable(...)` (writes a keyframe
  when the property is animated, else the static value) and call
  `markHistoryBoundary()` on pointer-up for a single undo step.

`MultiGizmo` (same file) is the **multi-selection** affordance (D-041, D-049): an
individual selection box around EACH selected shape — **move only, no
resize/rotate handles, and no single group-spanning bounding box** (D-049). It's
visual (`pointerEvents: none`); the group move drag is initiated from
`CanvasOverlay` (grabbing any selected element), and a press in empty space hits
nothing → clears the selection (the cursor-tool rule), so there is no group box
to grab. The `size === 1` path keeps the full `Gizmo` above, untouched.

## Drag, snap, selection, hit-testing

- **Hit-testing** — `hitsElement` (point-in-rotated-box via `inverseToLocal`) and
  `topmostHit` (iterate in paint order, **last hit wins**; skips invisible/locked).
- **Selection / create / drill** — `CanvasOverlay.onPointerDown` dispatches by the
  active tool; a plain click replaces the selection, **shift/ctrl-click toggles**
  one element in/out (`toggleInSelection`, D-041); double-click enters text edit or
  **drills one level** into a nested composition instance (`drillTarget` maps the
  click into the child's resolution).
- **Move** — `beginDrag` streams a single element's `position.x/y` via
  `commitAnimatable` (keyframe-aware). For a multi-selection, `beginGroupDrag`
  applies the SAME delta to every movable member (visible & unlocked —
  `collectGroupMoveTargets` in `group-move.ts`) via the **keyframe-free**
  `writeStaticAnimatable`, snapping the grabbed anchor only; one undo step via
  `markHistoryBoundary` at the gesture ends. A pure click on a member collapses the
  selection to it.
- **Snap** — `snapValue` (single resize edge) and `snapAxis` (drag: tries the box's
  near / centre / far anchors) snap to **canvas edges + centre, every other
  element's edges + centre, and the operator's ruler guides**, within ~6–7 screen px
  (converted to scene px by `/zoom`). Snapping is suppressed while rotated (H/V snap
  is undefined) and while Shift is held; matched snaps draw a guide line.

## Tools system

`DesignerTool = 'cursor' | 'hand' | 'text' | 'shape' | 'ellipse' | 'image'`.
`CanvasToolbar` renders one `Control` per tool (→ `designerStore.setTool`);
`CanvasOverlay.onPointerDown` switches on the active tool: `cursor` selects/drags,
`hand` pans, the creator tools add an element from
[`state/element-defaults.ts`](../../state/element-defaults.ts) at the click point
and snap back to `cursor`.

## Contracts / invariants

- The overlay reasons in **scene coords** and at the **effective (animated)
  transform**; never in raw screen px past the `screenToScene` boundary.
- A **locked** element can be selected (to recolour / unlock) but not moved, and its
  resize/rotate gizmo is hidden.
- All edits go through the **store** (`commitAnimatable` / `addElement` / …) — the
  overlay never mutates the scene object directly, and one gesture =
  `markHistoryBoundary()` once.
- `geometry.ts` / `hit-test.ts` / `drill.ts` are **pure** (no React, no store, no
  DOM) — that's what makes them unit-testable and what keeps this doc honest.

## Extension points

> Adding user-facing canvas behaviour? Add/extend an E2E test (see the rule in
> [`CLAUDE.md`](../../../../../../CLAUDE.md)) and put any new math in `geometry.ts`
> with a unit test. Update this doc when structure/contracts change (doc-sync rule).

### Add a new canvas tool

1. Add the id to `DesignerTool` in [`state/store.ts`](../../state/store.js) (and a
   `setTool` already handles it).
2. Add a `ToolEntry` to `TOOLS` in `CanvasToolbar.tsx` (icon + label).
3. If it creates an element, add a `defaultX(...)` to `state/element-defaults.ts`
   and a branch in `CanvasOverlay.onPointerDown` that adds it at the click's
   `scenePoint`, then returns to `cursor`. (A non-creating tool handles its own
   gesture there instead.)

### Add a new gizmo handle / interaction

1. Render the handle in `Gizmo.tsx` (position it in the rotated `box(...)` frame;
   wire `onPointerDown` to a `begin…` gesture).
2. Put the **pure math** in `geometry.ts` (a `compute…` that takes the start
   transform + pointer scene point and returns the new transform fields) and
   unit-test it; keep the store/`pointermove` plumbing in `Gizmo.tsx`.
3. Commit via `commitAnimatable` + a single `markHistoryBoundary()` on pointer-up.

### Add a new snap rule / guide

1. Add the candidate lines to the snap-target builders (`buildSnapTargets` in
   `Gizmo.tsx` for resize, the target arrays in `beginDrag` in `CanvasOverlay.tsx`
   for move) — both already include canvas/element/guide lines.
2. Reuse `snapValue` (single edge) or `snapAxis` (box anchors) from `geometry.ts`;
   if a genuinely new snapping shape is needed, add a pure helper there + a test.
3. Feed matched lines to `designerStore.setSnapGuides(...)` so the overlay draws
   them.

## Testing

- **Unit (pure logic):** `geometry.ts`, `hit-test.ts`, `drill.ts` are in the Vitest
  coverage scope (`apps/designer/vitest.config.ts`). See
  [`tests/canvas-geometry.test.ts`](../../../../tests/canvas-geometry.test.ts),
  [`tests/hit-test.test.ts`](../../../../tests/hit-test.test.ts),
  [`tests/gizmo.test.ts`](../../../../tests/gizmo.test.ts),
  [`tests/composition-drill.test.ts`](../../../../tests/composition-drill.test.ts).
- **E2E (the React/interaction layer):** the Playwright suite drives the real
  surface (`data-testid="canvas-surface"`) — drag, select, drill, snap — so the
  components themselves aren't chased for unit coverage.
