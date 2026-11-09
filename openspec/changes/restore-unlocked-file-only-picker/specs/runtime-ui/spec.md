## ADDED Requirements

### Requirement: An unlocked file-only text input can reconnect in CG Control

CG Control SHALL offer the file picker for unlocked File-only text, multiline and unstructured
text-list fields without a source. The operator SHALL be able to detach an unlocked source and
choose another. The manual editor stays disabled in File-only mode.

#### Scenario: Reload a ticker after clearing its missing file in Designer

- **WHEN** the reloaded package retains File only but clears the ticker's authored file path
- **THEN** the missing file is detached and CG Control offers the picker on the existing row
- **AND** choosing a replacement stages its content with the authored delimiter until Update
- **AND** the existing applied content is preserved when the operator chooses to keep row data

#### Scenario: Detach an unlocked text file in the Inspector

- **WHEN** the operator detaches the file from a file-only text input
- **THEN** the picker is available again and the row retains its applied data

#### Scenario: A detached file finishes reading late

- **WHEN** a read finishes after its source has been detached or replaced
- **THEN** its content and errors do not change the field's draft or replacement source
