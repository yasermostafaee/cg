## ADDED Requirements

### Requirement: Issue messages are selectable and copyable

The Designer Issues dialog SHALL permit selection and native clipboard copying
of issue messages. Clicking or selecting a message SHALL keep the dialog open.
An issue that identifies an element SHALL offer a separate, keyboard-accessible
control for navigating to that element.

#### Scenario: Click the message or navigate to its element

- **GIVEN** the Issues dialog shows a message about an element
- **WHEN** the author clicks the message
- **THEN** the dialog stays open and the layer selection remains unchanged
- **WHEN** the author activates the navigation control
- **THEN** Designer selects the affected element and closes the dialog

#### Scenario: Copy a message while a layer is selected

- **GIVEN** the Issues dialog is open and a layer is selected
- **WHEN** the author selects an issue message and presses the clipboard copy shortcut
- **THEN** the clipboard contains that message and the dialog stays open
