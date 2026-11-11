## ADDED Requirements

### Requirement: CG Control provides a compact layer Inspector

The Inspector SHALL provide independently collapsible Layer details and Position sections. The
selected layer's name, template and current status SHALL remain visible. A collapsed Position
SHALL summarize the effective anchor and offsets and indicate an unapplied Position change. The
Inspector SHALL keep Update and Discard in the footer and retain the existing field editors.

#### Scenario: Inspect a Ready row with collapsed sections

- **WHEN** the operator collapses Layer details and Position on a Ready row
- **THEN** the row name, template and Ready state remain visible
- **AND** each disclosure reports its collapsed state and can reopen with the keyboard

#### Scenario: Keep a Position draft while the section is collapsed

- **WHEN** the operator edits Position and collapses that section
- **THEN** the summary shows the draft placement and the unapplied marker
- **AND** reopening shows the same staged position
- **AND** Update and Discard remain available with the section collapsed

#### Scenario: Edit Fields with a compact Inspector

- **WHEN** the operator edits the selected template's Fields
- **THEN** simple field labels and values share compact rows where space permits
- **AND** complex and grouped editors retain their labels, content and controls
- **AND** the selected row's fields still use the existing staged Update and Discard workflow
