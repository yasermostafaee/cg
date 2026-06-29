# designer-canvas-viewport (B-027 delta)

## MODIFIED Requirements

### Requirement: An off-frame pasteboard for parking/editing shapes

The canvas SHALL present an off-frame PASTEBOARD — a dark area around the frame — whose extent is a
FIXED function of the resolution (NOT content-grown): a margin of 1× the frame width on the left AND
right, and 1× the frame height on the top AND bottom, so the total stage is 3× the frame width by 3×
the frame height, with the frame at the constant inset (1× width, 1× height). The extent and the frame
offset SHALL NOT depend on element positions, so dragging a shape off-frame moves ONLY the shape — the
dark area never resizes and the frame origin never shifts (so the frame cannot drift on a drag).
Element moves SHALL be CLAMPED to the pasteboard so there is NO dead zone: a single drag, a
multi-select group drag, and an arrow-key nudge SHALL each keep the moved element's full bounding box
(for a group, the whole selection's combined bounding box) inside the extent, so no part of any shape
can be moved into the clipped region beyond the extent — the pasteboard IS the whole workable area, and
a shape can never become invisible/unselectable by being dragged off it. The clamp SHALL only TIGHTEN:
a shape that is ALREADY outside the extent (e.g. loaded from an older scene or imported with far
coordinates) SHALL NOT be snapped violently or pushed further out — it can move freely until it is
inside, then it is bounded — so such a shape is always recoverable (draggable back in), never trapped. A
shape LARGER than the pasteboard on an axis SHALL be centered on that axis (it cannot fit, so it stops
following the pointer there rather than fighting it). The frame SHALL be clearly OUTLINED so the author
distinguishes the frame (what exports) from the pasteboard (what does not), and the PASTEBOARD in turn
SHALL be visually distinguished from the empty surround beyond it — the surround (the scroll container)
is a DARKER tone than the pasteboard and the pasteboard carries a subtle edge outline — so the workable
area reads as a defined rectangle (insurance/clarity even though the clamp already keeps shapes inside).
In authoring the editor SHALL lift the stage clip (the canvas iframe renders with
`.cg-stage { overflow: visible }`) so a fully off-frame shape PAINTS into the pasteboard on ANY side
(left/top as well as right/bottom) instead of being clipped, and such a shape SHALL remain selectable
and draggable on the canvas (the pointer/hit-test layer covers the whole pasteboard). The frame inset
SHALL be a CSS variable (`--cg-frame-x/-y`, baked with the constant offset as the load-time fallback)
that the runtime never recreates; because the offset is constant per resolution it updates only when
the RESOLUTION changes (no reload), never per drag/scrub. The canvas SHALL distinguish three regions by
tone: the empty SURROUND (the scroll container beyond the pasteboard) is `#0e1018`, the PASTEBOARD (the
stage and the iframe body) is `#161927`, and a FRAME-SIZED page backdrop is drawn as the frame's
`background-color` `#3d4253` (BEHIND the checkerboard and the shapes), so every shape — on-frame over
the page or off-frame over the pasteboard — paints ON TOP and stays visible (the page backdrop is never
an overlay that occludes a shape). On-frame editing SHALL be UNCHANGED — scene (0,0) is the frame's
top-left (inset into the pasteboard), and every consumer (iframe, overlay, rulers) measures from that
constant offset, so click→scene placement and on-frame hit-testing are identical to before. The
pasteboard is an AUTHORING affordance only, driven by an `authoring` flag on the preview document that
is INDEPENDENT of the broadcast flag: the broadcast preview modal and the exports SHALL keep the native
clip (off-frame content stays invisible, frame offset `{0,0}`) and the modal SHALL still open
blank-until-play. Save SHALL persist off-frame shapes in the project (`.cg.json`), while the broadcast
preview + export SHALL still EXCLUDE fully-off-frame static shapes (the Phase-A export filter,
unchanged, applied to the modal/export scene). The fixed extent SHALL NOT regress the canvas layout:
the fit action and project-open SHALL fit the zoom from the FRAME bounds (NOT the extent) and CENTER the
frame in the viewport; the canvas SHALL show NO default scrollbars (the overflowing pasteboard is
pannable, but the scrollbars are hidden); the minimum zoom SHALL be the COVER-FIT of the pasteboard over
the viewport — the MAXIMUM of the two axis ratios (viewportW/extentW, viewportH/extentH) — so that at
maximum zoom-out the pasteboard always COVERS the viewport and NO empty surround is visible (one axis may
overflow and scroll); this minimum SHALL recompute when the viewport size or the resolution changes, and
if the current zoom is below the new minimum it SHALL be clamped UP (the Fit zoom always lands above this
floor, so Fit is never clamped down); a Ctrl+wheel zoom SHALL zoom toward the CURSOR (and the zoom buttons
toward the viewport centre); the rulers SHALL place scene (0,0) at the frame top-left and track scroll +
zoom; and the alignment / snap guides SHALL span the FULL visible canvas (the scroll viewport), not the
frame dimensions.

#### Scenario: The pasteboard extent is a fixed function of the resolution

- **WHEN** the canvas renders a composition of a given resolution
- **THEN** the pasteboard stage is 3× the frame width by 3× the frame height (a 1× frame margin on
  every side), with the frame at the constant inset (1× width, 1× height)

#### Scenario: Parking a shape off-frame does NOT resize the extent or shift the frame

- **WHEN** the author moves a shape outside the frame on any side (including off the LEFT or TOP, i.e.
  negative scene coordinates)
- **THEN** the pasteboard extent and the frame offset are UNCHANGED (no grow-to-fit, no origin shift),
  and within the extent the shape still paints into the pasteboard and stays selectable + draggable

#### Scenario: The frame does not drift when a shape is parked off-frame on the left/top

- **WHEN** the author parks a shape off the LEFT or TOP of the frame
- **THEN** the frame's on-screen position is identical to before (no jitter, no drift) — only the
  dragged shape moved

#### Scenario: Dragging a shape toward an edge stops at the pasteboard edge

- **WHEN** the author drags a shape toward (and past) the edge of the pasteboard on any side
- **THEN** the shape STOPS with its full bounding box at the pasteboard edge — it never crosses into
  the clipped region and never disappears

#### Scenario: Arrow-key nudge stops at the pasteboard edge

- **WHEN** the author nudges a shape with the arrow keys toward an edge until it reaches the bound
- **THEN** further nudges in that direction do not move it past the pasteboard edge (the full box stays
  inside)

#### Scenario: A multi-select group is bounded so no member crosses the edge

- **WHEN** the author drags or nudges a multi-selection toward an edge
- **THEN** the group stops as soon as ANY member's bounding box reaches the pasteboard edge (the whole
  selection box stays inside; relative offsets are preserved)

#### Scenario: A shape already outside is recoverable, not trapped

- **WHEN** a shape was saved/imported BEYOND the extent and the author drags it
- **THEN** it is not snapped violently and is never pushed further out — it can be dragged back toward
  the frame and, once its box is inside, it is clamped normally

#### Scenario: The canvas distinguishes pasteboard from surround and the page is not occluded

- **WHEN** the author views the canvas and places a shape on the frame (over the page backdrop)
- **THEN** the empty surround reads `#0e1018`, the pasteboard reads `#161927` with a subtle edge
  outline, and the frame-sized `#3d4253` page backdrop is drawn behind — the shape paints ON TOP of the
  page (visible + selectable, not occluded by the backdrop)

#### Scenario: On-frame editing is unchanged

- **WHEN** the author places, selects, or drags a shape inside the frame
- **THEN** it behaves exactly as before the pasteboard (scene (0,0) is the frame's top-left)

#### Scenario: Fit and project-open fit the frame and center it

- **WHEN** the author opens a project/composition or clicks Fit
- **THEN** the zoom is fit from the FRAME bounds (not the extent) and the frame is centered in the
  viewport (deterministically, with the constant frame offset)

#### Scenario: The minimum zoom is the cover-fit so no empty surround shows

- **WHEN** the author zooms out as far as the controls allow
- **THEN** the zoom stops at the cover-fit minimum (the max of the two viewport/extent axis ratios), so
  the pasteboard still covers the viewport on both axes with NO empty surround — one axis may overflow
  and be scrollable

#### Scenario: The cover-fit minimum tracks the viewport and resolution

- **WHEN** the viewport is resized (or the composition resolution changes) so the cover-fit minimum rises
  above the current zoom
- **THEN** the minimum is recomputed and the current zoom is clamped UP to it, so the surround never
  appears; the Fit zoom (which frames the smaller frame) remains above the minimum and is unaffected
