## ADDED Requirements

### Requirement: Operators can place authored live frames from Preview

CG Control SHALL allow a frame opted in by its author to be moved and resized in PVW.
The PVW control SHALL display a frame icon beside its **Edit frames** label.
Resize SHALL preserve the authored aspect ratio unless the author enables free resize.
An opted-in frame in a one-plate composition SHALL travel with the artwork in that composition.

#### Scenario: Author frame placement

- **WHEN** a Designer author enables placement on a frame and exports the template
- **THEN** CG Control can identify the frame independently in each Look
- **AND** it uses proportional resize unless the author chose free resize
- **AND** the frame has no placement controls if the author did not opt in

#### Scenario: Move a frame with its picture and artwork

- **WHEN** an operator applies a valid placement to the selected Look and frame
- **THEN** the picture, mask, title and fallback share the frame geometry
- **AND** an on-air update retains the existing input producer

#### Scenario: Edit without putting a draft on air

- **WHEN** an operator moves or resizes a frame in PVW
- **THEN** the edit remains a draft until Update
- **AND** Discard restores the last applied placement
- **AND** an off-air Update saves the placement for the next Take
