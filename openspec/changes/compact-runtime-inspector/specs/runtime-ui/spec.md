## ADDED Requirements

### Requirement: CG Control provides a compact layer Inspector

The Inspector SHALL provide independently collapsible Layer details, Position and Timing sections. The
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

#### Scenario: Select another layer with sections collapsed

- **WHEN** the operator collapses Layer details, Position or Timing and selects another layer
- **THEN** each section retains its expanded or collapsed state
- **AND** the summary and fields reflect the newly selected layer
- **AND** the same behavior applies after dismissing the narrow Inspector overlay to switch layers

#### Scenario: Collapse Timing while editing a row

- **WHEN** the operator collapses Timing
- **THEN** its facts and controls are hidden and the disclosure remains available by keyboard
- **AND** staged Timing values are available to Update and Discard while the section is collapsed

#### Scenario: Edit Fields with a compact Inspector

- **WHEN** the operator edits the selected template's Fields
- **THEN** simple field labels and values share compact rows where space permits
- **AND** complex and grouped editors retain their labels, content and controls
- **AND** the selected row's fields still use the existing staged Update and Discard workflow

#### Scenario: Edit Fields in the narrow Inspector beside a maximized monitor

- **WHEN** the operator opens the Inspector companion beside a maximized monitor
- **THEN** field labels stack above their controls where the two-column layout would make the inputs
  too narrow to edit comfortably
- **AND** fields remain editable while the monitor stays visible

#### Scenario: Turn and load pages in a Sequence field

- **WHEN** the selected template has a Sequence field with page navigation and load actions
- **THEN** the page strip and controls use the full width below the field name
- **AND** the navigation and load actions fit on their respective rows at the normal Inspector width
