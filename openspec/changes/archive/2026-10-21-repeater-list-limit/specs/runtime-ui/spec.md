## ADDED Requirements

### Requirement: CG Control stops the operator at a repeater's max items

CG Control's import SHALL stamp each `list` field that drives a repeater with its row limit (`maxItems`, by
`listFieldMaxItems`; dropped when nothing justifies it), and the GDD SHALL carry the same `maxItems` on the field's
array property. The Inspector's list editor SHALL state the count against the limit (`2 / 2`) and SHALL withhold Add
item at the limit; below it Add item SHALL work as before. A list with no limit SHALL be unchanged.

#### Scenario: At the limit

- **WHEN** a template whose repeater takes at most 2 rows is loaded on a row with 2 rows
- **THEN** the Inspector reads `2 / 2` and Add item is withheld

#### Scenario: Below the limit

- **WHEN** the operator removes a row
- **THEN** the Inspector reads `1 / 2`, and Add item adds one, back to `2 / 2`

#### Scenario: The GDD

- **WHEN** a template whose repeater takes at most 6 rows is exported
- **THEN** its GDD's array property for the list carries `maxItems: 6`
