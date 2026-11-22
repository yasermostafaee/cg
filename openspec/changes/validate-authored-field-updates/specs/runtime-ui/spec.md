## MODIFIED Requirements

### Requirement: A staged value its field's pattern refuses is said under the field and never sent

CG Control SHALL check staged dynamic field values against the applicable
authored constraints, including Required, text lengths and pattern, multiline
line limits, numeric limits, and list limits. The pattern still accepts a match
as typed or with Latin digits. Update from the Inspector and the layer row SHALL
use the same validation. A refusal SHALL identify the field and rule, retain the
draft, and send no part of that update. A previously applied value that is left
untouched SHALL not prevent another field from being updated. A direct row
update SHALL apply the same validation to changed values before committing them.

#### Scenario: Required text and lengths are enforced

- **WHEN** an operator clears a required field, enters whitespace alone or
  enters text outside the field's limits
- **THEN** the field identifies the applicable rule and Update sends neither
  the refused value nor its sibling edits
- **AND** a corrected value permits the complete draft to be applied

#### Scenario: A required numeric field with bounds

- **WHEN** the operator clears a required numeric field or enters a number
  outside its authored bounds and presses Update
- **THEN** its field explains the invalid value and Update refuses the draft
- **AND** a number within the bounds allows the same draft to be applied

#### Scenario: A mistyped azan time

- **WHEN** an operator types `25:00` into a field with the `Time (HH:MM)` pattern
  and presses Update
- **THEN** the field reads `Not a Time (HH:MM), e.g. 21:30.` and the update is refused

#### Scenario: A time typed in Persian digits

- **WHEN** the operator types `۲۰:۳۲` or `20:32` and presses Update
- **THEN** the accepted spelling is applied as typed

#### Scenario: Update of a composition field

- **WHEN** a changed value inside a composition group fails its authored rule
- **THEN** the Bridge refuses the update with the field's label and reason
- **AND** an unchanged invalid sibling value does not prevent a separate valid edit

## ADDED Requirements

### Requirement: Authored field descriptions are available in the Inspector

The Inspector SHALL make each nonempty authored description available through
field help in the Control Inspector.

#### Scenario: Open help for a custom text field

- **WHEN** the operator opens help for a field with a Persian description
- **THEN** the authored description is readable in its own text direction
- **AND** a field without a description omits its help control
