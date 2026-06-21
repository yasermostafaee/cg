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
filter, unchanged, applied to the modal/export scene).

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
