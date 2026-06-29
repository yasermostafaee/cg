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
(scrolls the container), and the pinned rulers + draggable guides. It stays
edit-surface only — the per-composition Preview / Export triggers (D-086 Phase B)
live OFF the canvas, pinned at the foot of the left rail (`CompositionActionBar`),
so the canvas keeps full height.

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

**Gizmo on a content-sized box (D-060).** An auto-sized text element
(`fitMode: 'autosize'`) is sized by the runtime from its content, so
`transform.size` is no longer authoritative. The gizmo measures the element's
RENDERED local box from the preview iframe (`measure-element.ts` →
`offsetWidth/Height`, unaffected by zoom or the element's own scale/rotate) and
feeds that as the box `w × h` (for RTL, the rendered left edge is
`position.x − width`); the `Scale·Rotate`-about-anchor projection (B-022) is
otherwise unchanged. Its **resize handles are inert** (the box is content-driven —
move + rotate still work). `CanvasArea` registers the preview document and bumps a
measure version after each scene stream + on `document.fonts.ready` so the gizmo
re-measures and stays glued. The auto→fixed toggle commits the measured size into
`transform.size` once (D-046 §E) — the only write-back, a discrete user action.

## Off-frame pasteboard (D-071 Phase B; content-aware follow-up B-026)

The stage is a **content-aware pasteboard**: its size is `pasteboardLayout(resolution, content?)`,
where `content` is the scene-coord AABB of all on-canvas elements at the current frame
(`contentBounds(layers, currentFrame)` — corner-folds each top-level element through `localToScene`
at `effectiveTransformAt`; a nested composition **instance** counts only its **own box**, since
instances render `overflow:hidden` and clip their children). The base is the **fixed 2× extent** —
the frame plus a margin (`PASTEBOARD_MARGIN_RATIO`, a fraction of the frame) on **all four sides**,
symmetric so off-frame shapes show on **every** side (left/top too). The extent then:

- **grows only past a 2× boundary** (Q1 = B): content within `[−margin, size+margin]` per axis is
  **byte-identical** to the old fixed 2× (everyday off-frame drags don't touch the seams); once
  content crosses a boundary the extent grows to give it a **full margin** of headroom;
- **shrinks back** toward 2× as far content returns inward, but **never below** the 2× floor;
- is **clamped** at `MAX_EXTENT_RATIO` (12×) the frame per axis, so a stray far coordinate (bad
  import / fat-finger drag) can't blow the iframe up.

This keeps a shape parked far off-frame **visible + selectable** (the old fixed extent clipped it out
of the iframe past the margin). With no off-frame content the result is exactly the old 2× (the
default `content` is the frame box — full back-compat).

`layout.frame` is the frame's **offset** (scene px) into the stage: **scene (0,0) sits there**, not
at the stage origin — and it **grows** when content extends off the **left/top** (so off-frame
content lands at positive iframe coords). Three places consume that offset so they agree: the iframe
(`frameOffset` insets `.cg-stage` — see below), the overlay (`CanvasOverlay`'s frame box is inset by
`frameOffset × scale`, so the gizmos/`canvas-surface` and click→scene measure from the frame), and
the rulers (`rulerOrigin = stageRect − outerRect + frame × zoom`; `measure` is re-keyed on
`frameOffset` so it re-fires on an origin shift, not only on scroll/zoom).

Because the offset can move at runtime, two seams keep it live:

- **Live `.cg-stage` inset** — the baked `.cg-stage { top/left }` is a **CSS variable** on `:root`
  (`--cg-frame-x/-y`) that `createRuntime` never recreates; the grown offset rides the existing
  rAF-throttled `scene-replace` postMessage (and the `scrub` message — the offset is **current-frame
  derived**, so an animated shape flying off-frame shifts it as the playhead moves) and updates the
  variables via a shared `applyFrameOffset` helper, so the frame re-insets **live** with no iframe
  reload/flash (the baked value is only the load-time fallback).
- **Origin-shift scroll-comp** — a `useLayoutEffect` keyed on `frameOffset` scrolls by
  `offsetShiftScroll(scroll, Δoffset, zoom)` so the visible content stays **stationary** when the
  origin shifts (left/up growth **and** inward shrink). It is **independent** of the zoom-anchor
  effect (disjoint keys: `frameOffset` vs `zoom` — a drag moves the offset not the zoom, a zoom the
  reverse), and `prevOffsetRef` resets on `sceneId` so fit-on-open isn't fought.

The iframe element is sized to the extent; a **`device-width` viewport** means the runtime content
fills that size with **no stretch**. `fitToViewport` fits the zoom from the **frame** bounds — the
**resolution**, NOT the grown extent — (so the frame is large) and `centerFrameInView` scrolls so the
frame is **centered** (⛶ + project-open). The pasteboard overflows the viewport, but **the scrollbars
are hidden** (`s.outer`) — there are no default scrollbars; the operator pans with the hand tool /
wheel and zooms with Ctrl+wheel.

**Two-tone, by region.** The **surround** (everything beyond the frame — `s.outer` _and_ the
iframe `html, body`) is the dark **`#161927`**. The **frame-sized page backdrop** is a light gray
**`#a7a7a7`** (with a near-white **`#f5f5f5`** checker) — it is `.cg-stage`'s **`background-color`**,
so CSS paints it _behind_ the checkerboard (`background-image`) and the shapes (children). Every
shape — on-frame over the `#a7a7a7` page _or_ off-frame over the `#161927` surround — paints **on
top** of both backdrops and stays visible + selectable; because `#a7a7a7` is a `background-color` it
is a **backdrop, never an overlay** (it cannot occlude a shape).

**Zoom toward a point.** `zoomAt(factor, clientX, clientY)` measures the scene point under the
anchor pre-zoom and stashes it; a **`useLayoutEffect` keyed on `zoom`** then applies the scroll
correction (`zoomAnchorScroll`) **synchronously after the relayout but BEFORE paint**, so the point
lands back under the anchor with **no jump** (doing it in a `requestAnimationFrame` painted the
resized-but-unscrolled frame first — a one-frame jerk per wheel notch). Ctrl+wheel anchors on the
**cursor**, the +/−/1× buttons on the **viewport centre** (not the stage's top-left corner). The
fit/centre path has no stashed anchor, so the layout effect no-ops there — wheel-zoom never
recenters (auto-fit is keyed on `sceneId` + resolution, never on `zoom`).

The rulers + guides live in a **non-scrolling overlay** (`s.overlay`) that is a **sibling** of the
scroll container (`s.outer`), not a child of it — absolutely-positioned children of an
`overflow:auto` element scroll **with** the content, which would slide the rulers out of view and
drift the guides on zoom+scroll. The overlay is pinned to the visible viewport; `rulerOrigin`
(re-measured on every scroll / zoom / resize) places scene 0 at the frame top-left and tracks the
stage as it scrolls **under** the overlay. So the rulers stay pinned and the alignment/snap guides
span the **whole visible canvas** (`inset:0`), not just the frame.

Two INDEPENDENT preview-document flags decide what the iframe shows (`Preview.#buildHtml`):

| Surface            | `broadcast` | `authoring` | `.cg-stage` clip       | result                                             |
| ------------------ | ----------- | ----------- | ---------------------- | -------------------------------------------------- |
| Canvas iframe      | `false`     | `true`      | **lifted** (`visible`) | painted + **off-frame paints** into the pasteboard |
| Broadcast modal    | `true`      | `false`     | native (`hidden`)      | blank-until-play (D-087) + clipped                 |
| Export (.vcg/HTML) | —           | —           | native (`hidden`)      | clipped + the Phase-A off-frame filter             |

So off-frame shapes are **visible + selectable/draggable** while authoring (the overlay's
pointer/hit-test layer covers the whole pasteboard), **persist in save**, but are **excluded from
the broadcast preview + export** (Phase A drops fully-off-frame static ones). The `canvas-surface`
test hook is a FRAME-sized child of the pointer layer, so `canvas.boundingBox()` stays the frame.

## The gizmo (handles + transform math)

`Gizmo.tsx` renders the selection frame: an SVG outline plus four corner squares,
four edge strips, four outer rotation zones, and a centre pivot — each positioned at
the element's **projected corners** (`gizmoCorners`), so the frame traces the
renderer's `Scale·Rotate`-about-anchor box exactly: a **parallelogram** under
non-uniform scale, not a rotated rectangle (B-022). The handles are fixed
screen-size; only the outline (an SVG `<polygon>`) follows the parallelogram. The
pointer gestures live in `Gizmo.tsx` (they read the store and run the
`pointermove`/`up` loop); the **math is pure in `geometry.ts`**:

- **Resize** — `computeResize(t, handle, pointerScene)`. The opposite corner is
  fixed (`RESIZE_CFG`); the new size is the pointer→fixed-corner vector — **undone by
  the element scale, then projected onto the local axes** (so resize works correctly
  when rotated AND scaled), clamped to `MIN_SIZE`; the top-left is then recomputed
  (rotate then scale) so the fixed corner stays glued. Edge handles free one axis only.
- **Rotate** — `pivotClientFromGrab` recovers the pivot (the `anchor`) from the
  grabbed corner, applying the element's `Scale·Rotate` to the corner offset so the
  pivot is correct under a prior (non-uniform) scale; `computeRotationAngle` adds the
  change in cursor angle (`atan2` about the pivot) to the start angle, snapping to the
  nearest 15° within `SNAP_DEG` (Shift = free).
- Resize/rotate commit via `designerStore.commitAnimatable(...)` (writes a keyframe
  when the property is animated, else the static value) and call
  `markHistoryBoundary()` on pointer-up for a single undo step.

`MultiGizmo` (same file) is the **multi-selection** affordance (D-041, D-049,
D-050): an individual selection box (2px, D-050) around EACH selected shape —
**move only, no resize/rotate handles, and no single group-spanning bounding
box** (D-049). It's
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
  `collectGroupMoveTargets` in `group-move.ts`) via the SAME **keyframe-aware**
  `commitAnimatable` (D-054 — a member with a track on the moved axis keyframes at
  the playhead, others write their static base; `m.x/m.y` are evaluated-at-playhead
  so the keyframe holds start+delta, B-005-safe), snapping the grabbed anchor only;
  one undo step via `markHistoryBoundary` at the gesture ends. A pure click on a
  member collapses the selection to it.
- **Snap** — `snapValue` (single resize edge) and `snapAxis` (drag: tries the box's
  near / centre / far anchors) snap to **canvas edges + centre, every other
  element's edges + centre, and the operator's ruler guides**, within ~6–7 screen px
  (converted to scene px by `/zoom`). Snapping is suppressed while rotated (H/V snap
  is undefined) and while Shift is held; matched snaps draw a guide line.

## Tools system

`DesignerTool = 'cursor' | 'hand' | 'text' | 'shape' | 'ellipse' | 'pen' | 'image'`.
`CanvasToolbar` renders one `Control` per tool (→ `designerStore.setTool`);
`CanvasOverlay.onPointerDown` switches on the active tool: `cursor` selects/drags,
`hand` pans, the creator tools add an element from
[`state/element-defaults.ts`](../../state/element-defaults.ts) at the click point
and snap back to `cursor`.

D-109 — the `pen` tool is the multi-gesture exception: [`pen-draw.ts`](./pen-draw.ts)
is a module-level pointer state machine (click = corner anchor, drag = smooth with
mirrored handles, click-first-anchor = close, Enter/Esc/double-click = finish open),
upserting the `path` element live (`pathFromScenePoints`) so preview == export
mid-draw. A selected path's edit affordance is [`PathEditor`](./PathEditor.tsx) — an
SVG overlay of draggable anchor squares + handle dots (Alt breaks a mirrored pair,
click a segment to insert, Delete removes + re-stitches), shown **only with the
select tool** so its dots don't intercept the pen's close-click. `hit-test.ts` adds
the path branch (point-in-polygon for a closed interior + distance-to-stroke), and
the B-022 gizmo is reused unchanged (size = the points' bbox; the runtime SVG
`viewBox` makes a size-resize rescale the outline without re-baking points).

D-040 — the `image` (logo) tool stamps a `source: 'shared'` image from the device
**shared library** ([`features/sharedLibrary`](../sharedLibrary)): the operator's
selected library thumbnail (`activeSharedImage`), else the first, sized to the
image's aspect; an empty library surfaces a `showNotice` hint and inserts nothing
(the D-030 guard). The `asset-urls` postMessage map that fixes up `<img>` `src` in
the preview iframe is the **merge of the project asset cache and the shared image
cache** (disjoint id-spaces); an unresolved reference renders a placeholder + a
one-time warning, never a crash.

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

1. Render the handle in `Gizmo.tsx` (position it at a projected point from
   `gizmoCorners(...)` in screen space; wire `onPointerDown` to a `begin…` gesture).
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
