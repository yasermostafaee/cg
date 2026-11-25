## ADDED Requirements

### Requirement: Station admins can assign shortcuts to fixed layer actions

The Layers section of Station setup SHALL list each fixed layer by number followed by its configured
alias or standard row name, in the interface's reading direction. Action headings SHALL use the
interface language. A station admin SHALL be able to assign and remove a physical key combination
for Play, Next, Stop and Clear. A combination SHALL be unique within its channel. Assignments SHALL
be stored with the fixed layer bank and survive a restart. Next assignment SHALL be available when
the Bridge advertises support for its storage.

#### Scenario: Configure and reload a binding

- **WHEN** an admin assigns a shortcut to Play on an aliased layer and applies the settings
- **THEN** reopening the Layers settings shows the assignment on that layer
- **AND** assigning the same combination to another action in that channel shows a conflict

#### Scenario: Read the shortcut table in the interface language

- **WHEN** an admin opens the shortcut dialog
- **THEN** the action headings use the selected interface language
- **AND** the number precedes its layer name in the reading direction, including for mixed-script names

#### Scenario: Start with the function-key defaults

- **WHEN** a bank has no saved shortcut configuration and the Bridge supports Next
- **THEN** declared layers 99 through 88 use F1 through F12 for Play, Ctrl plus the same key for
  Stop, Shift plus the key for Clear, and Alt plus the key for Next
- **AND** Space is unassigned and other declared layers have no default bindings
- **AND** a saved configuration, including an empty one, takes precedence

#### Scenario: Apply or revert changes in the shortcut dialog

- **WHEN** an admin applies a shortcut draft from the dialog
- **THEN** it is saved independently of pending names and visibility changes
- **AND** shortcuts edited elsewhere are preserved when their cells are unedited here
- **AND** Revert restores the most recently saved assignments

#### Scenario: Record Space in the shortcut dialog

- **WHEN** a Bridge advertises Space support and the admin records the physical Space key
- **THEN** the dialog can assign it to Play, Next, Stop or Clear once per channel
- **AND** empty cells show an em dash, and recording leaves the table's row heights and column widths stable
- **AND** the table scrolls horizontally on a narrow window
- **AND** an older Bridge still supports the legacy shortcut keys

### Requirement: Layer shortcuts use the guarded row actions

A shortcut SHALL target the exact layer of the selected channel. It SHALL invoke the existing row
action, with its availability, pending state and confirmation, only when shortcuts are enabled.
The Layers toolbar and shortcut dialog SHALL expose the same enable switch. The switch SHALL
start off for every console session. Disabling shortcuts SHALL suspend layer key dispatch in the
main window and all detached panels and release the Alt+F4 shortcut outside recording.
Editable focus, modal dialogs, context menus and repeated keydown events SHALL suspend shortcuts.

#### Scenario: Enable and disable shortcuts for this session

- **WHEN** the console opens or reloads
- **THEN** the shortcut switch is off and pressing F1 or another assigned key runs no layer action
- **WHEN** the operator turns shortcuts on
- **THEN** an assigned key invokes the available guarded action
- **WHEN** the operator turns shortcuts off
- **THEN** assigned keys run no layer action in the main window or detached panels
- **AND** saved assignments and the layer action buttons stay available

#### Scenario: Show where to enable inactive shortcuts

- **WHEN** the operator presses a configured key with shortcuts off and the key reaches the workspace
- **THEN** no layer action runs
- **AND** a message in the feedback language points to Layer shortcuts in the Layers toolbar
- **AND** editing, an open modal or menu, a repeated keydown, or an unassigned key produces no notice
- **AND** ordinary keyboard behavior remains available

#### Scenario: Keep docked and detached Layers open when pressing F5 on Windows

- **WHEN** focus is in the docked or detached native Layers pane and the operator presses F5
- **THEN** the same pane document, rows and selection stay available
- **AND** the key follows the same assigned-action, session-switch and editing rules as in the main window

#### Scenario: Operate the assigned layer with the table filtered

- **WHEN** shortcuts are enabled and the operator presses the Play shortcut for a filtered layer or in a fullscreen monitor
- **THEN** the same Play action runs for that layer if the operator and layer can play
- **AND** shortcut targets outside the visible list do not add rows to the layer table or monitor companion

#### Scenario: Use the assigned Next action

- **WHEN** shortcuts are enabled and the operator presses Next for a layer with an available Next action
- **THEN** the same guarded row action advances the template step or book page
- **AND** the action is available while the layer is filtered out
- **AND** the shortcut performs no action when the button is disabled

#### Scenario: Confirm Clear and preserve editing focus

- **WHEN** shortcuts are enabled and the operator presses a Clear shortcut whose action requires confirmation
- **THEN** the existing Clear confirmation opens
- **AND** the same shortcut performs no layer action while a text editor holds focus

#### Scenario: Use Space outside shortcut recording

- **WHEN** shortcuts are enabled and the operator presses Space while its assigned row action is available
- **THEN** it invokes that action once, without also activating the focused control
- **AND** when shortcuts are off, Space is unassigned, or the action is unavailable, the focused control keeps its usual keyboard behavior
