# designer-canvas-viewport (delta)

## ADDED Requirements

### Requirement: An off-frame pasteboard for parking/editing shapes

The canvas SHALL present an off-frame PASTEBOARD — a dark area around the frame with a margin on ALL
FOUR sides — where the author can park, see, and move shapes outside the frame. The pasteboard
extent SHALL be a FIXED function of the resolution (NOT driven by element positions), so dragging a
shape NEVER resizes the dark area — only zoom changes its on-screen size. The frame SHALL be clearly
OUTLINED so the author distinguishes the frame (what exports) from the pasteboard (what does not).
In authoring the editor SHALL lift the stage clip (the canvas iframe renders with
`.cg-stage { overflow: visible }`) so a fully off-frame shape PAINTS into the pasteboard on ANY side
(left/top as well as right/bottom) instead of being clipped, and such a shape SHALL remain
selectable and draggable on the canvas (the pointer/hit-test layer covers the whole pasteboard). The
canvas SHALL be TWO-TONE by region: the SURROUND (everything beyond the frame — the scroll container
and the iframe body) is the lighter `#161927`, and a FRAME-SIZED page backdrop is the darker
`#080a10` drawn as the frame's `background-color` (BEHIND the checkerboard and the shapes), so every
shape — on-frame over the page or off-frame over the surround — paints ON TOP and stays visible
(the `#080a10` is a backdrop, never an overlay that occludes a shape). On-frame editing SHALL be
UNCHANGED — scene (0,0) is the frame's top-left (inset into the
pasteboard), and every consumer (iframe, overlay, rulers) measures from that offset, so click→scene
placement and on-frame hit-testing are identical to before. The pasteboard is an AUTHORING
affordance only, driven by an `authoring` flag on the preview document that is INDEPENDENT of the
broadcast flag: the broadcast preview modal and the exports SHALL keep the native clip (off-frame
content stays invisible) and the modal SHALL still open blank-until-play. Save SHALL persist
off-frame shapes in the project (`.cg.json`), while the broadcast preview + export SHALL still
EXCLUDE fully-off-frame static shapes (the Phase-A export filter, unchanged, applied to the
modal/export scene). Adding the pasteboard SHALL NOT regress the canvas layout: the fit action and
project-open SHALL fit the zoom from the FRAME bounds and CENTER the frame in the viewport; the
canvas SHALL show NO default scrollbars (the overflowing pasteboard is pannable, but the scrollbars
are hidden); a Ctrl+wheel zoom SHALL zoom toward the CURSOR (and the zoom buttons toward the
viewport centre); the rulers SHALL place scene (0,0) at the frame top-left and track scroll + zoom;
and the alignment / snap guides SHALL span the FULL visible canvas (the scroll viewport), not the
frame dimensions.

#### Scenario: A shape parked off-frame on any side renders on the pasteboard and stays editable

- **WHEN** the author moves a shape fully outside the frame on any side (including off the LEFT or
  TOP, i.e. negative scene coordinates)
- **THEN** it paints into the pasteboard (the authoring clip is lifted, not clipped away) and
  remains selectable and draggable on the canvas

#### Scenario: Dragging a shape never resizes the dark area

- **WHEN** the author drags a shape around the canvas, including far off-frame
- **THEN** the pasteboard (dark area) keeps its size — only zooming (Ctrl+wheel or the zoom buttons)
  changes the dark area's on-screen size

#### Scenario: The canvas is two-tone and a shape over the page is not occluded

- **WHEN** the author places a shape on the frame (over the darker `#080a10` page)
- **THEN** the surround reads `#161927` and the frame-sized page backdrop reads `#080a10`, and the
  shape paints ON TOP of the page (visible + selectable, not occluded by the `#080a10` backdrop)

#### Scenario: On-frame editing is unchanged

- **WHEN** the author places, selects, or drags a shape inside the frame
- **THEN** it behaves exactly as before the pasteboard (scene (0,0) is the frame's top-left)

#### Scenario: The broadcast preview + export exclude the off-frame shape; the modal still blanks

- **WHEN** a composition with a fully-off-frame static shape is previewed (broadcast) or exported
- **THEN** that shape is absent from the output (the Phase-A filter, through the authoring flag),
  and the broadcast modal still opens blank-until-play (D-087 intact)

#### Scenario: Save keeps the off-frame shape

- **WHEN** the project is saved
- **THEN** the off-frame staging shape is persisted in the `.cg.json` (the exclusion is
  export-only)

#### Scenario: On open / fit, the frame is fit and centered with no default scrollbars

- **WHEN** a project is opened, or the fit action is invoked
- **THEN** the zoom is fit from the frame bounds, the frame is centered in the canvas viewport (no
  off-center scroll), and NO scrollbars are shown by default (the overflowing pasteboard is pannable
  but its scrollbars are hidden)

#### Scenario: Ctrl+wheel zooms toward the cursor

- **WHEN** the author Ctrl+wheels over the canvas to zoom
- **THEN** the scene point under the cursor stays under the cursor (the zoom is anchored on the
  pointer, not the stage's top-left corner)

#### Scenario: The rulers track scroll and zoom from the frame origin

- **WHEN** the canvas is scrolled or zoomed
- **THEN** the rulers read scene 0 at the frame top-left and scene (W/2, H/2) at the frame center,
  for the current scroll + zoom

#### Scenario: The rulers and guides stay pinned to the visible viewport on scroll

- **WHEN** the canvas is zoomed in so it overflows and is then scrolled
- **THEN** the rulers and the alignment/guide lines stay pinned to the visible viewport (they do not
  scroll out of view with the content) while their tick/guide positions follow the scrolling stage

#### Scenario: Alignment guides span the full visible canvas

- **WHEN** a drag raises an alignment / snap guide
- **THEN** the guide spans the full visible canvas (the scroll viewport), not just the frame
  dimensions
