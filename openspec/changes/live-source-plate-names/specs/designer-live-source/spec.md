## MODIFIED Requirements

### Requirement: A drawn Live Source plate is named automatically and says so, and a plate with no source is refused
A newly drawn Live Source SHALL receive the next free `plate-N` in its look, marked automatic until confirmed or renamed. Existing ids SHALL remain unchanged. Author mode SHALL draw that id with a clearly legible label; output mode SHALL paint no label.

#### Scenario: New plate name
- **WHEN** a look already uses `plate-1` and another Live Source is drawn **THEN** the new automatic id is `plate-2`

#### Scenario: Existing name preservation
- **WHEN** a project containing `live-1` is opened **THEN** its id remains `live-1`
