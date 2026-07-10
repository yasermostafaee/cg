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

The stage is a **FIXED pasteboard** (B-027): its size is `pasteboardLayout(resolution)` — a pure
function of the resolution, **not** content-grown. The margin per side is the LARGER of an absolute
minimum or one full frame: `marginX = max(PASTEBOARD_MIN_X (5000), frameWidth)` left + right,
`marginY = max(PASTEBOARD_MIN_Y (3000), frameHeight)` top + bottom → total extent
`frameWidth + 2·marginX` × `frameHeight + 2·marginY`. `layout.frame` is the frame's **constant
offset** into the stage (scene (0,0) sits there): `(marginX, marginY)`. The absolute floor keeps the
pasteboard usefully large even for a TINY frame — a plain 1× multiplier made a 100×100 frame only a
300×300 pasteboard, so the cover-fit min-zoom shot to ~428% and **froze** zoom; with the floor a
100×100 frame is a 10100×6100 pasteboard and zoom-out stays free. Once the frame exceeds a floor on an
axis (e.g. 8000 wide > 5000) the margin grows with it (one frame per side: an 8000-wide frame →
24000-wide pasteboard).

Because the extent + offset are constant per resolution, dragging a shape off-frame moves **only the
shape** — the dark area never grows and the frame never drifts (the old grow-to-fit origin shift was
the during-drag jitter source; it, plus `contentBounds` and the origin-shift scroll-comp seam, were
removed).

**No dead zone — drags/nudges are clamped to the pasteboard.** A shape's full bounding box can never
cross the extent edge: `beginDrag` (single), `beginGroupDrag` (the whole selection box), and
`nudgeSelection` (arrow keys) all run their delta through `clampDeltaToPasteboard` against
`pasteboardSceneBounds(resolution)`, so a shape can never reach the clipped region beyond the extent
(no invisible/unselectable shapes) — the pasteboard **is** the whole workable area. Edge cases: a
shape that begins OUTSIDE (an old/imported scene) isn't yanked — the clamp only tightens (never pushes
it further out) and lets it move back in, then bounds it; a shape LARGER than the pasteboard on an axis
is centered on that axis (it can't fit, so it stops following the pointer there).

**Dynamic cover-fit minimum zoom.** Because shapes can't leave the pasteboard, empty surround beyond it
is wasted space — so the minimum zoom is the **cover-fit** of the pasteboard over the viewport:
`dynamicZoomMin = coverZoom(viewport, extent) = MAX((viewportW + ε) / extentW, (viewportH + ε) / extentH)`
(the MAX, not the contain-fit `min`), where `ε = COVER_OVERSHOOT_PX` biases each axis target **up** by a
hair. At maximum zoom-out the pasteboard therefore **covers all four viewport edges** (no surround ever
shows); the axis with the larger ratio is the tight one and the other overflows / scrolls. The over-cover
bias matters because without it the cover axis lands `extent × (viewport / extent) === viewport`
**exactly** — zero overflow slack — so a sub-pixel centering scroll exposes a hairline of `#0e1018`
surround on the **trailing** (right/bottom) edge; over-covering by a couple px gives the scroll slack so
all four edges hug. The other half of "hug all four edges" is that **`s.outer` carries no padding**: the
cover-fit already guarantees the pasteboard overflows the viewport, so padding never framed a smaller
stage — it only offset the stage into the content box (while `coverZoom` covers the padding-box
`clientWidth`), showing as a surround strip on the **leading** edge; removing it makes the box the stage
fills equal the box the cover-fit targets. `clampZoom` binds every zoom path (buttons, Ctrl+wheel, Fit)
to this floor (+ `ZOOM_MAX`), and it recomputes whenever the viewport (ResizeObserver) or the resolution
(extent) changes — a `useEffect` clamps the current zoom **up** if the floor rose. `ZOOM_HARD_MIN` (0.02)
is only a degenerate-case safety net. Fit (below) always lands above this floor, so it is never clamped
down.

Three places consume the (constant) offset so they agree: the iframe (`frameOffset` insets `.cg-stage`
via the `--cg-frame-x/-y` CSS vars — see below), the overlay (`CanvasOverlay`'s frame box is inset by
`frameOffset × scale`, so the gizmos / `canvas-surface` and click→scene measure from the frame), and
the rulers (`rulerOrigin = stageRect − outerRect + frame × zoom`).

The `.cg-stage` inset is a **CSS variable** on `:root` (`--cg-frame-x/-y`) baked with the constant
offset as the load-time fallback; the offset still rides the `scene-replace` / `scrub` postMessages
(via `applyFrameOffset`), but since it is constant per resolution those are **idempotent** during a
drag (they only actually change when the **resolution** changes — B-028, no reload). No live origin
shift, so there is no scroll-comp seam.

The iframe element is sized to the extent; a **`device-width` viewport** means the runtime content
fills that size with **no stretch**. Fit fits the zoom from the **frame** bounds — the **resolution**,
NOT the extent (so the frame is large) — and centering scrolls so the frame is **centered**, computed
arithmetically from the constant offset (`frameCenterScroll`, B-035) in a layout effect — drift-free.
The pasteboard overflows the viewport, but **the scrollbars are hidden** (`s.outer`); the operator
pans with the hand tool / wheel and zooms with Ctrl+wheel.

**Tones, by region.** Three nested tones make the workable area read as a defined rectangle: the
empty **scroll-container surround** (`s.outer`, beyond the pasteboard) is the darkest **`#0e1018`**;
the **pasteboard** itself (the stage + the iframe `html, body`) is **`#161927`**, marked off from the
surround by a subtle 1px edge ring on `s.stage` (a `box-shadow`, so the boundary is explicit even
though clamping already keeps shapes inside); the **frame-sized page backdrop** is **`#3d4253`** (with
a **`#5b6075`** checker) — it is `.cg-stage`'s **`background-color`**, so CSS paints it _behind_ the
checkerboard (`background-image`) and the shapes (children). Every shape — on-frame over the `#3d4253`
page _or_ off-frame over the `#161927` pasteboard — paints **on top** of both backdrops and stays
visible + selectable; because `#3d4253` is a `background-color` it is a **backdrop, never an overlay**
(it cannot occlude a shape).

**Zoom toward a point.** `zoomAt(factor, clientX, clientY)` measures the scene point under the
anchor pre-zoom and stashes it; a **`useLayoutEffect` keyed on `zoom`** then applies the scroll
correction (`zoomAnchorScroll`) **synchronously after the relayout but BEFORE paint**, so the point
lands back under the anchor with **no jump** (doing it in a `requestAnimationFrame` painted the
resized-but-unscrolled frame first — a one-frame jerk per wheel notch). Ctrl+wheel anchors on the
**cursor**, the +/−/1× buttons on the **viewport centre** (not the stage's top-left corner). The
fit/centre path has no stashed anchor, so the layout effect no-ops there — wheel-zoom never
recenters (auto-fit is keyed on `sceneId` + resolution, never on `zoom`).

**High zoom + pixel grid (D-120).** The maximum zoom is **6400%** (`ZOOM_MAX = 64`; one scene pixel =
64 screen px at the top) — deep enough for pixel-perfect work; the dynamic cover-fit **minimum**
(B-027) is unchanged, and every zoom path still routes through the single `clampZoom`. At high zoom a
**pixel grid** (1 cell = 1 scene pixel) is drawn over the WHOLE pasteboard, shown only when one scene
pixel maps to **≥ 8 screen px** (`pixelGridVisible(zoom)`, i.e. zoom ≥ 800%) so normal zoom isn't
cluttered.

The grid is a **device-pixel-snapped `<canvas>`** (not a CSS gradient — a gradient's fixed
**fractional** period, e.g. 48.08px at 4808%, drifts each line off the device-pixel raster, so the
browser anti-aliased every line across two pixels: doubled/blurry at fractional scales, crisp only at
integer ones). The canvas is the **bottom layer of the non-scrolling ruler overlay** (`s.overlay`):
viewport-sized, `pointer-events:none`, tracking the stage via `rulerOrigin` exactly as the rulers do.
It paints lightly over the scroll content (shapes + gizmos) and under the rulers/guides; hit-testing
stays on the canvas below the overlay. `drawPixelGrid` repaints it whenever `rulerOrigin` (scroll),
zoom, or the viewport changes, using `pixelGridLines(origin, zoom, lengthCss, dpr, rasterPhase)` —
which **culls** to the visible region (only ~viewport/zoom lines, a few dozen at high zoom) and snaps
each line to `Math.round(pos·dpr + rasterPhase) + 0.5`, so a 1-device-px stroke lands on a **single
physical pixel** — crisp at **any** zoom, HiDPI included. Snapping each line **independently** means
no accumulating drift: a line for scene X stays within half a device pixel of its true screen pos
`rulerOrigin + X·zoom` (the SAME mapping the rulers use — invisible as position at high zoom,
decisive for crispness), so the grid never drifts from the rulers. Every 10th line
(`scene % 10 === 0`, so scene 0 / ±10 / ±20 — round ruler labels) is drawn a hair stronger
(graph-paper).

**Grid ↔ content alignment (B-042).** The snap targets the **PHYSICAL screen raster, not the
canvas-internal one** — the overlay sits at an arbitrary (fractional) device position (the studio
layout puts the canvas viewport at a fractional CSS x at every dpr), and the scaled preview iframe
composites **un-snapped at its ideal position** (measured), so a canvas-internal snap left painted
strokes displaced (the compositor snapped/resampled the fractionally-placed layer: −0.39 device px
at dpr 1, −0.5 at dpr 1.25 measured) and **stretched** across the viewport (backing store rounded to
device px but displayed at the un-rounded CSS size → `round(w·dpr)/(w·dpr)` scale, 1.00031 at dpr
1.25 — the misalignment GREW past ½ device px). `drawPixelGrid` therefore (1) floor-aligns the
canvas element itself to the device raster — `gridCanvasAlignment(screenCssPos, dpr)` gives the
integer device origin, the sub-CSS-px `left`/`top` **nudge** that lands the layer on it (nothing for
the compositor to snap or resample), and the fractional-offset **`phase`** folded into each line's
snap; and (2) sizes the CSS box FROM the backing store (`gridBackingSize`: `cssPx = devicePx/dpr`,
raster scale **exactly 1**; +2 device px overspan keeps the viewport covered despite the nudge,
clipped by the overlay). The alignment is derived from the OUTER viewport's rect — never the
grid canvas's own rect (the draw nudges it — reading it back would feed back). The stage / scroll
pipeline is untouched (B-027 / B-035 invariants hold).

**Containing-pixel snap + gizmo fidelity (B-042, owner-machine round).** Each stroke is the device
pixel **CONTAINING** its lattice line — `floor(trueScreenDevice) + 0.5`, not nearest-rounding: the
stage composites at an arbitrary per-axis device phase (owner-measured Y ≈ 0.68 in every reading,
X a scroll lottery), the content paints AT its layout position (verified-deselected paint
profiles: one honest AA pixel per edge), and `round` put whole strokes one pixel PAST every edge
at phases > ½ (the owner-visible +0.81 device-px Y offset). Under `floor` the stroke center stays
≤ ½ device px from the line at ANY phase. The **ruler tick marks** snap to the SAME pixel
(`snapMarkToGridPixel`, 1 device px wide) so grid↔ruler cannot split. The **selection gizmo** (the
thing the operator actually stares at when working selected): its visual projection quantizes the
box through the engine's LayoutUnit lattice (`quantizeBoxToLayout` — 1/64 css px, truncated;
measured `2.2749px → 2.265625`), so at fractional model coords the frame traces the RENDERED edges
(raw-model projection sat up to `zoom·dpr/64` = 1.25 device px outside at 6400%/dpr 1.25), and its
frame stroke is **1 device px** (a 1-css stroke is a fuzzy 1.25-device band at dpr 1.25).
Interaction math stays on the raw model; the border remains honest for fractional placement
(D-122 governs placement snapping). Verification lives in `pixel-paint.spec.ts` — screenshot-pixel
assertions with the selection state PROVEN (a silently-selected shape puts the gizmo's accent
border on the measured edge; that artifact once mimicked a "content smear" — see the change's
`design.md`, Takes 3–5).

**Stale-raster position pin (B-045).** Chromium loses raster invalidation for `left`/`top`
changes ≲ 2 CSS px inside the ×zoom-scaled canvas subtree: layout and the DOM update, the painted
pixels stay at the previous position — through idle, scrolling, and even full runtime rebuilds
(node replacement does not invalidate the stale tiles; no display-list poke does either —
measured, see `design.md` Take 6). `transform` updates are compositor-tracked and never miss, so
the CANVAS preview document (`REVEAL_ON_LOAD` gate in `platform/preview.ts` — the broadcast modal
and exported outputs are untouched) pins every runtime element's box at `left/top: 0` and carries
its position in a `translate(x, y)` prefix, quantized to the engine's 1/64-css LayoutUnit lattice
(pixel parity with playout; the gizmo projection stays exact; transform-origin math is unaffected
because a translate composed first commutes out of the origin conjugation). Interception is a
realm-local per-element style Proxy (every engine `left`/`top` write reroutes synchronously,
before paint); RTL auto-hug text (right-anchored, `left:auto`) opts out. The root fix — the
engine itself positioning via transform — is queued as D-096 and deletes this shim. Regression
coverage: the `B-045` test in `pixel-paint.spec.ts` (sub-pixel inspector edit + arrow-step
nudges, painted edge vs layout edge).

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
- **Pixel snap at grid zoom (D-122)** — when the pixel grid is visible
  (`pixelGridVisible(zoom)`, zoom ≥ 800%), the Snapping preference is on, and **Alt**
  is not held, a MOVE lands on WHOLE scene pixels so a moved element's edges sit on the
  grid lines. Three pure helpers in `geometry.ts` do the math and are shared by the drag
  and nudge paths (and unit-tested): `pixelSnapActive(zoom, snappingEnabled, alt)` (the
  gate), `snapDragToPixel(pos)` (round — the drag), `snapNudgeToPixel(coord, signedStep)`
  (the nudge's direction-aware first-snap — a fractional coord's first nudge lands on the
  NEXT integer in the direction, then steps by whole pixels). In `beginDrag` /
  `beginGroupDrag` the pixel round SUPERSEDES the smart-guide `snapAxis` at grid zoom (the
  ~6-screen-px threshold is sub-0.1 scene px there, and the always-visible grid is the
  guide); the anchor is snapped for a group so relative offsets are preserved. The
  arrow-key nudge (`nudgeSelection` in `state/slices/elements.ts`, driven by the App.tsx
  window keydown) snaps the anchor's active axis. **Alt** bypasses all snapping (free
  sub-pixel move); below the threshold nothing snaps; Inspector-typed values are always
  free. The nudge path has no direct access to the CanvasArea-local zoom, so it reads a
  `canvasZoom` MIRROR the store keeps (`view.setCanvasZoom`, published by a CanvasArea
  effect); the drag path already has the zoom as its `scale`. Resize-handle snapping is a
  deliberate follow-up (out of scope). Root: `openspec/specs/designer-canvas-view`
  (D-122 delta).

## Tools system

`DesignerTool = 'cursor' | 'hand' | 'text' | 'shape' | 'ellipse' | 'pen' | 'image'`.
`CanvasToolbar` renders one `Control` per tool (→ `designerStore.setTool`);
`CanvasOverlay.onPointerDown` switches on the active tool: `cursor` selects/drags,
`hand` pans, the creator tools add an element from
[`state/element-defaults.ts`](../../state/element-defaults.ts) at the click point
and snap back to `cursor`.

D-109/B-037 — the `pen` tool is the multi-gesture exception:
[`pen-draw.ts`](./pen-draw.ts) is a module-level pointer state machine (click =
corner anchor, drag = smooth with mirrored handles, click-first-anchor = close,
Enter/double-click = finish open, **Esc = cancel** — the created element is
removed), upserting the `path` element live (`pathFromScenePoints`) so preview ==
export mid-draw. B-053 — corner vs smooth is decided **at pointer-UP** from the
gesture's total displacement against `PEN_SMOOTH_PX` (SCREEN px, zoom-independent —
the D-122 hysteresis lesson): the mid-hold preview is live (corner restored when
the pointer dips back under the guard), a click-sized release actively clears any
jitter-set handles, and only the just-placed anchor is ever touched — a previous
smooth anchor keeps its handles, so a corner's incoming side stays curved as the
prior anchor defines (Illustrator semantics). B-037 — finishing keeps the pen **armed**: the next pointer-down
starts a NEW element (`freshElementId`), N draws → N independent elements; exiting
to the cursor is explicit (toolbar, or Esc while idle). The draft may not outlive
the pen session: `CanvasOverlay` calls `endPenSession()` (finish a ≥ 2-anchor draft
open / drop a smaller one — idempotent) from an effect watching the active tool +
composition and on unmount, so a mid-draw tool or composition switch can never leak
the draft into a later session (the original B-037 append-to-shape-1 bug). While
drafting, the overlay renders non-interactive draw-state feedback (anchor markers, a
rubber band from the last anchor to the pointer — curved through a smooth anchor's
out handle — and a first-anchor close-affordance ring inside `PEN_CLOSE_PX`).

A selected path's edit affordance is [`PathEditor`](./PathEditor.tsx) — an SVG
overlay of draggable anchor squares + handle dots (Alt breaks a mirrored pair, click
a segment to insert a CORNER, click-DRAG a segment to insert a SMOOTH anchor whose
mirrored handles follow the drag — B-054, the pen's drag-to-smooth on insertion,
one undo entry with the corner/smooth decision at pointer-up — Delete removes +
re-stitches), shown **only with the select tool** so its dots don't intercept the
pen's close-click. B-037 — the single-select
**Gizmo is likewise gated off while the pen is armed**: `addElement` auto-selects
the in-progress draft, and the gizmo's corner/edge/rotation hit-zones sit exactly on
the draft's bbox (the first anchor is always there), so unmounting it is what makes
the close-click and draw-over-a-selected-shape clicks reach the pen at all.
`hit-test.ts` adds the path branch — B-055: both the closed-interior ray-cast and
the stroke grab-margin run over the **flattened curved outline** (each segment
sampled from the exact cubic the runtime renders, `c1 = a + a.out` /
`c2 = b + b.in`, 16 sub-segments per curve; the display mapping mirrors the
runtime viewBox's `max(bbox, 1)` clamp), so bézier bulges outside the anchor
polygon hit and concavities inside it miss — and the B-022 gizmo is reused
unchanged for cursor-tool selection (size = the points' bbox; the runtime SVG
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
- **Paint diagnostics — the B-042 probe (`B042Probe.tsx`, kept on purpose):** an opt-in
  on-canvas panel for diagnosing sub-pixel paint/alignment issues on the OPERATOR's machine —
  the class of defect (B-042 alignment, B-045 stale raster) that only reproduces on a real
  compositor at a real fractional `devicePixelRatio` and is invisible to unit tests. Strictly
  flag-gated: renders ONLY with `?b042probe=1` in the URL or `localStorage.b042probe = '1'`;
  zero footprint otherwise. It reports live (2 Hz): `devicePixelRatio`, zoom, per-axis stage
  device phases, grid-stroke vs content-edge device positions with expected↔measured deltas
  (reading the live `--cg-frame-*` vars), gizmo edges from the polygon points, and a build tag —
  the numbers an owner screenshot can be reconciled against pixel-by-pixel (that reconciliation
  is exactly how B-045 was isolated; see the archived change's `design.md` Takes 3–6).
