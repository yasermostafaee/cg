## MODIFIED Requirements

### Requirement: A drawn Plate is named automatically and says so, and a plate with no source is refused

A newly drawn Plate SHALL receive the next free `plate-N` in its switchable state, marked automatic until confirmed or renamed. Existing ids SHALL remain unchanged. Author mode SHALL draw that id with a clearly legible label; output mode SHALL paint no label. The Designer SHALL call the frame a **Plate** in visible labels, actions, accessible names and refusal messages; internal Live Source schema/type names SHALL remain unchanged.

#### Scenario: New plate name

- **WHEN** a switchable state already uses `plate-1` and another Plate is drawn **THEN** the new automatic id is `plate-2`

#### Scenario: Designer vocabulary

- **WHEN** the author creates, selects, binds or receives an error about a live-input frame **THEN** the user-facing noun is `Plate`, never `Live Source`

#### Scenario: Existing name preservation

- **WHEN** a project containing `live-1` is opened **THEN** its id remains `live-1`
