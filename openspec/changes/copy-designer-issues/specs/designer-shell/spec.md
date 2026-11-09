## ADDED Requirements

### Requirement: Issue messages are selectable and copyable

The Designer Issues dialog SHALL permit selection and native clipboard copying
of issue messages. Selecting a message SHALL keep the dialog open. Activating
an issue SHALL continue to navigate to the affected element when available.

#### Scenario: Copy a message while a layer is selected

- **GIVEN** the Issues dialog is open and a layer is selected
- **WHEN** the author selects an issue message and presses the clipboard copy shortcut
- **THEN** the clipboard contains that message and the dialog stays open
