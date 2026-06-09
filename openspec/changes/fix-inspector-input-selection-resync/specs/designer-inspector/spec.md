## ADDED Requirements

### Requirement: Inspector inputs reflect the currently-selected element

Every editable input in the inspector SHALL display the value of the
currently-selected element. When the selection changes to a different element, each
input SHALL re-initialise to the newly-selected element's value, even when the
previous and new elements share the same committed value and even if the previous
input held an uncommitted (in-progress) draft. An input SHALL NOT carry one element's
unsaved draft over to another element's display.

#### Scenario: Switching elements mid-edit shows the new element's value

- **WHEN** the operator types into element A's Data key input without committing
  (no Enter / blur) and then selects element B
- **THEN** the inspector shows element B's OWN Data key (its committed value), not
  element A's uncommitted draft

#### Scenario: The same stale-display fix applies to the other inspector inputs

- **WHEN** the operator types an uncommitted value into the element Name input, a
  field Title / Description / Value, or a stroke / shadow colour, and then selects a
  different element
- **THEN** each input shows the newly-selected element's own value, not the prior
  element's draft

### Requirement: A pending edit still commits to the previously-selected element

Changing the selection SHALL still commit a pending (typed-but-not-Entered) edit to
the element that was selected when the edit was made. Re-initialising the display for
the new element SHALL NOT discard or misattribute the previous element's edit.

#### Scenario: The pending data-key edit saves to the previous element

- **WHEN** the operator types a Data key into element A's input and then selects
  element B (which blurs A's input)
- **THEN** the typed key is saved to element A (its field/binding are created), and
  element B's input shows its own value
