## ADDED Requirements

### Requirement: A cleared canvas rehearsal retains its editor backdrop

Designer SHALL preserve the checkerboard frame on the editing canvas after Rehearse clears the artwork.

#### Scenario: Rehearse Stop clears the artwork

- **WHEN** Stop finishes the authored Outro in a Designer canvas rehearsal
- **THEN** the artwork is hidden and the checkerboard frame stays visible
- **AND** leaving Rehearse restores the authoring artwork
