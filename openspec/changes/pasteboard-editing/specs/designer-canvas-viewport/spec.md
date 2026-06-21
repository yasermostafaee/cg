# designer-canvas-viewport (delta)

## ADDED Requirements

### Requirement: An off-frame pasteboard for parking/editing shapes

The canvas SHALL present an off-frame PASTEBOARD — a dark area beyond the frame (extending to the
right and bottom) where the author can park, see, and move shapes outside the frame. The frame
SHALL be clearly OUTLINED so the author distinguishes the frame (what exports) from the pasteboard
(what does not). In authoring the editor SHALL lift the stage clip (the canvas iframe renders with
`.cg-stage { overflow: visible }`) so a fully off-frame shape PAINTS into the pasteboard instead of
being clipped, and such a shape SHALL remain selectable and draggable on the canvas (the
pointer/hit-test surface covers the pasteboard). On-frame editing SHALL be UNCHANGED — the frame
stays at the surface origin, so click→scene placement and on-frame hit-testing are identical to
before. The pasteboard is an AUTHORING affordance only, driven by an `authoring` flag on the
preview document that is INDEPENDENT of the broadcast flag: the broadcast preview modal and the
exports SHALL keep the native clip (off-frame content stays invisible) and the modal SHALL still
open blank-until-play. Save SHALL persist off-frame shapes in the project (`.cg.json`), while the
broadcast preview + export SHALL still EXCLUDE fully-off-frame static shapes (the Phase-A export
filter, unchanged, applied to the modal/export scene). Adding the pasteboard SHALL NOT regress the
canvas layout: the stage extent SHALL collapse to the FRAME for an empty / on-frame document (so it
fits + centers as before, growing only when off-frame content is parked); the fit action and
project-open SHALL fit the zoom from the FRAME bounds and then CENTER the frame in the viewport; the
rulers SHALL place scene (0,0) at the frame top-left and track scroll + zoom; and the alignment /
snap guides SHALL span the FULL visible canvas (the scroll viewport), not the frame dimensions.

#### Scenario: A shape parked off-frame renders on the pasteboard and stays editable

- **WHEN** the author moves a shape fully outside the frame
- **THEN** it paints into the pasteboard (the authoring clip is lifted, not clipped away) and
  remains selectable and draggable on the canvas

#### Scenario: On-frame editing is unchanged

- **WHEN** the author places, selects, or drags a shape inside the frame
- **THEN** it behaves exactly as before the pasteboard (the frame stays at the surface origin)

#### Scenario: The broadcast preview + export exclude the off-frame shape; the modal still blanks

- **WHEN** a composition with a fully-off-frame static shape is previewed (broadcast) or exported
- **THEN** that shape is absent from the output (the Phase-A filter, through the authoring flag),
  and the broadcast modal still opens blank-until-play (D-087 intact)

#### Scenario: Save keeps the off-frame shape

- **WHEN** the project is saved
- **THEN** the off-frame staging shape is persisted in the `.cg.json` (the exclusion is
  export-only)

#### Scenario: On open / fit, the frame is fit and centered (empty doc unchanged)

- **WHEN** a project (with an empty or on-frame composition) is opened, or the fit action is invoked
- **THEN** the stage extent equals the frame, the zoom is fit from the frame bounds, and the frame
  is centered in the canvas viewport (no off-center scroll)

#### Scenario: The rulers track scroll and zoom from the frame origin

- **WHEN** the canvas is scrolled or zoomed
- **THEN** the rulers read scene 0 at the frame top-left and scene (W/2, H/2) at the frame center,
  for the current scroll + zoom

#### Scenario: Alignment guides span the full visible canvas

- **WHEN** a drag raises an alignment / snap guide
- **THEN** the guide spans the full visible canvas (the scroll viewport), not just the frame
  dimensions
