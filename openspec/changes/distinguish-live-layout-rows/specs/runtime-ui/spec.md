## ADDED Requirements

### Requirement: The Layers table identifies its live-layout section

The Layers table SHALL label rows assigned to live layouts using a **Live layouts**
heading with a visible dividing rule before the first displayed row of that section.
The table SHALL derive membership from the configured bank and retain the row aliases.

#### Scenario: The layer list contains live-layout rows

- **WHEN** ordinary rows and live-layout rows are displayed in the Layers table
- **THEN** the Live layouts divider appears once before the first visible live-layout row
- **AND** the row aliases and their playout coordinates are unchanged

#### Scenario: The author browses live templates

- **WHEN** the operator opens Templates
- **THEN** its category, template details and destination messages call the category Live layouts
- **AND** the existing destination compatibility rules still apply
