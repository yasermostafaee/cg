## ADDED Requirements

### Requirement: The Preview form's list editor stops at the repeater's max items

The Designer's Preview data form SHALL edit a `list` field that drives a repeater (`repeater-items`) with the repeater's
row limit (`listFieldMaxItems`: its `maxItems`, the smallest when the list drives several): Add item SHALL be withheld
at the limit with the Rows section's reason, and rows past it SHALL be flagged "not shown", exactly as the repeater's
own Rows section does. A list with no limit SHALL be unchanged.

#### Scenario: At the limit

- **WHEN** a repeater with max items 2 is driven by a list field holding 2 rows and the Preview form is open
- **THEN** the form's Add item for that list is withheld, its reason `At most 2 rows (max items). Raise max items to add more.`
