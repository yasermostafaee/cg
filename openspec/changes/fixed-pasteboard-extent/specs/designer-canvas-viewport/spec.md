# designer-canvas-viewport (B-027 delta)

## MODIFIED Requirements

### Requirement: An off-frame pasteboard for parking/editing shapes

The canvas SHALL present an off-frame PASTEBOARD — a dark area around the frame — whose extent is a
FIXED function of the resolution (NOT content-grown): a margin of 3× the frame width on the left AND
right, and 2× the frame height on the top AND bottom, so the total stage is 7× the frame width by 5×
the frame height, with the frame at the constant inset (3× width, 2× height). The extent and the
frame offset SHALL NOT depend on element positions, so dragging a shape off-frame moves ONLY the
shape — the dark area never resizes and the frame origin never shifts (so the frame cannot drift on a
drag). A shape parked WITHIN the extent SHALL stay visible and selectable on any side; a shape parked
BEYOND the extent SHALL remain in the scene (selectable/draggable back, never deleted) but MAY be
clipped from the visible dark area — it is reachable by zooming out or panning (the minimum zoom SHALL
be low enough that a full zoom-out can show the ENTIRE fixed pasteboard). The frame SHALL be clearly
OUTLINED so the author distinguishes the frame (what exports) from the pasteboard (what does not). In
authoring the editor SHALL lift the stage clip (the canvas iframe renders with
`.cg-stage { overflow: visible }`) so a fully off-frame shape PAINTS into the pasteboard on ANY side
(left/top as well as right/bottom) instead of being clipped, and such a shape SHALL remain selectable
and draggable on the canvas (the pointer/hit-test layer covers the whole pasteboard). The frame inset
SHALL be a CSS variable (`--cg-frame-x/-y`, baked with the constant offset as the load-time fallback)
that the runtime never recreates; because the offset is constant per resolution it updates only when
the RESOLUTION changes (no reload), never per drag/scrub. The canvas SHALL be TWO-TONE by region: the
SURROUND (everything beyond the frame — the scroll container and the iframe body) is `#161927`, and a
FRAME-SIZED page backdrop is drawn as the frame's `background-color` (BEHIND the checkerboard and the
shapes), so every shape — on-frame over the page or off-frame over the surround — paints ON TOP and
stays visible (the page backdrop is never an overlay that occludes a shape). On-frame editing SHALL be
UNCHANGED — scene (0,0) is the frame's top-left (inset into the pasteboard), and every consumer
(iframe, overlay, rulers) measures from that constant offset, so click→scene placement and on-frame
hit-testing are identical to before. The pasteboard is an AUTHORING affordance only, driven by an
`authoring` flag on the preview document that is INDEPENDENT of the broadcast flag: the broadcast
preview modal and the exports SHALL keep the native clip (off-frame content stays invisible, frame
offset `{0,0}`) and the modal SHALL still open blank-until-play. Save SHALL persist off-frame shapes
in the project (`.cg.json`), while the broadcast preview + export SHALL still EXCLUDE fully-off-frame
static shapes (the Phase-A export filter, unchanged, applied to the modal/export scene). The fixed
extent SHALL NOT regress the canvas layout: the fit action and project-open SHALL fit the zoom from
the FRAME bounds (NOT the extent) and CENTER the frame in the viewport; the canvas SHALL show NO
default scrollbars (the overflowing pasteboard is pannable, but the scrollbars are hidden); a
Ctrl+wheel zoom SHALL zoom toward the CURSOR (and the zoom buttons toward the viewport centre); the
rulers SHALL place scene (0,0) at the frame top-left and track scroll + zoom; and the alignment / snap
guides SHALL span the FULL visible canvas (the scroll viewport), not the frame dimensions.

#### Scenario: The pasteboard extent is a fixed function of the resolution

- **WHEN** the canvas renders a composition of a given resolution
- **THEN** the pasteboard stage is 7× the frame width by 5× the frame height (margins 3× width
  left/right, 2× height top/bottom), with the frame at the constant inset (3× width, 2× height)

#### Scenario: Parking a shape off-frame does NOT resize the extent or shift the frame

- **WHEN** the author moves a shape far outside the frame on any side (including off the LEFT or TOP,
  i.e. large negative scene coordinates)
- **THEN** the pasteboard extent and the frame offset are UNCHANGED (no grow-to-fit, no origin shift),
  and within the extent the shape still paints into the pasteboard and stays selectable + draggable

#### Scenario: The frame does not drift when a shape is parked off-frame on the left/top

- **WHEN** the author parks a shape off the LEFT or TOP of the frame
- **THEN** the frame's on-screen position is identical to before (no jitter, no drift) — only the
  dragged shape moved

#### Scenario: A shape beyond the extent stays in the scene and is reachable

- **WHEN** the author parks a shape BEYOND the fixed extent
- **THEN** the shape is not deleted — it remains in the scene and selectable/draggable back — and the
  author can reach it by zooming out (the minimum zoom shows the whole fixed pasteboard) or panning

#### Scenario: The canvas is two-tone and a shape over the page is not occluded

- **WHEN** the author places a shape on the frame (over the page backdrop)
- **THEN** the surround reads `#161927` and the frame-sized page backdrop is drawn behind, and the
  shape paints ON TOP of the page (visible + selectable, not occluded by the backdrop)

#### Scenario: On-frame editing is unchanged

- **WHEN** the author places, selects, or drags a shape inside the frame
- **THEN** it behaves exactly as before the pasteboard (scene (0,0) is the frame's top-left)

#### Scenario: Fit and project-open fit the frame and center it

- **WHEN** the author opens a project/composition or clicks Fit
- **THEN** the zoom is fit from the FRAME bounds (not the extent) and the frame is centered in the
  viewport (deterministically, with the constant frame offset)
