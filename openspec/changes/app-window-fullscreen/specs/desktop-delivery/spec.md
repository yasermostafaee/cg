## ADDED Requirements

### Requirement: Both main app windows support fullscreen

CG Designer and CG Control SHALL enter and exit fullscreen in their main windows while retaining the current workspace.

#### Scenario: Designer toggles fullscreen from View or F11

- **WHEN** the author opens View
- **THEN** the menu presents Enter fullscreen or Exit fullscreen according to the current window state and shows F11
- **AND** the menu action and F11 toggle the same window.

#### Scenario: Control toggles fullscreen from the footer

- **WHEN** an operator uses the icon-only fullscreen button after Lock
- **THEN** the main window toggles fullscreen
- **AND** the button's accessible name and tooltip reflect the available action in the interface language.

#### Scenario: A Control media preview returns to the fullscreen app

- **GIVEN** CG Control is in app fullscreen
- **WHEN** the operator opens and closes a source media preview in fullscreen
- **THEN** the CG Control window remains in app fullscreen.

#### Scenario: Control keeps its layer keys

- **WHEN** an operator presses a layer-linked key such as F11 in CG Control
- **THEN** the current layer shortcut settings and rules determine the action.

#### Scenario: Keep the workspace through a fullscreen round trip

- **WHEN** the author or operator enters and exits fullscreen
- **THEN** the app retains the current session, its editor and layer state, and the placement of detached panels.
