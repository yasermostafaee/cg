## ADDED Requirements

### Requirement: Station admins can assign shortcuts to fixed layer actions

The Layers section of Station setup SHALL list the fixed layers by their configured aliases or
standard row names. A station admin SHALL be able to assign and remove a physical key combination
for Play, Next, Stop and Clear. A combination SHALL be unique within its channel. Assignments SHALL
be stored with the fixed layer bank and survive a restart. Next assignment SHALL be available when
the Bridge advertises support for its storage.

#### Scenario: Configure and reload a binding

- **WHEN** an admin assigns a shortcut to Play on an aliased layer and applies the settings
- **THEN** reopening the Layers settings shows the assignment on that layer
- **AND** assigning the same combination to another action in that channel shows a conflict

### Requirement: Layer shortcuts use the guarded row actions

A shortcut SHALL target the exact layer of the selected channel. It SHALL invoke the existing row
action, with its availability, pending state and confirmation. Editable focus, modal dialogs,
context menus and repeated keydown events SHALL suspend shortcuts.

#### Scenario: Operate the assigned layer with the table filtered

- **WHEN** a layer is filtered out or the monitor is fullscreen and the operator presses its Play shortcut
- **THEN** the same Play action runs for that layer if the operator and layer can play

#### Scenario: Use the assigned Next action

- **WHEN** the operator presses Next for a layer with an available Next action
- **THEN** the same guarded row action advances the template step or book page
- **AND** the action is available while the layer is filtered out
- **AND** the shortcut performs no action when the button is disabled

#### Scenario: Confirm Clear and preserve editing focus

- **WHEN** the operator presses a Clear shortcut for a layer whose Clear action requires confirmation
- **THEN** the existing Clear confirmation opens
- **AND** the same shortcut performs no layer action while a text editor holds focus
