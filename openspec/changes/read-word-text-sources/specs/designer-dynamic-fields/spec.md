## ADDED Requirements

### Requirement: Compatible Word documents are text sources

Compatible text-backed fields SHALL offer .doc, .docx and the established plain-text formats. The UI SHALL hide JSON from new format choices and file pick filters. Reading a supported Word document SHALL extract the body text without running macros, resolving remote links or emitting markup. Re-reading SHALL use the same parser and existing source permissions. Existing JSON bindings SHALL remain readable.

#### Scenario: Read and reload Word copy

- **WHEN** an operator selects a Word document with Persian text and paragraph breaks
- **THEN** the field uses the extracted plain text and reloads current text after the document changes

#### Scenario: Invalid Word source

- **WHEN** a malformed, encrypted, unsupported or oversized Word document is selected
- **THEN** the source is refused with a reason and the applied field remains intact

#### Scenario: Existing JSON source

- **WHEN** an existing JSON assignment is read again
- **THEN** its prior text behavior remains available, while new picks do not advertise JSON
