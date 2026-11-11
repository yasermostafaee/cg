## ADDED Requirements

### Requirement: Operators can place authored live frames from Preview

CG Control SHALL allow a frame opted in by its author to be moved and resized in PVW.
Resize SHALL preserve the authored aspect ratio unless the author enables free resize.

#### Scenario: Move a frame with its picture and artwork

- **WHEN** an operator applies a valid placement to the selected Look and frame
- **THEN** the picture, mask, title and fallback share the frame geometry
- **AND** an on-air update retains the existing input producer

#### Scenario: Edit without putting a draft on air

- **WHEN** an operator moves or resizes a frame in PVW
- **THEN** the edit remains a draft until Update
- **AND** Discard restores the last applied placement
