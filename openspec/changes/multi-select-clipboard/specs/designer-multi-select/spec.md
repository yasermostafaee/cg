# designer-multi-select (delta)

## ADDED Requirements

### Requirement: Selection-aware layer context-menu actions

The layer right-click menu SHALL apply its actions — Color, Fit (fit lifespan to the active
range), Copy, Cut, Paste, Duplicate, and Delete — to the WHOLE current selection, not just the
clicked row, each as ONE undo step. The right-clicked row SHALL be normalized into the selection
first (standard-editor behaviour): a row already part of the multi-selection keeps the whole
selection, while a row outside it replaces the selection with just that row, so the menu always
acts on the intended set. Copy SHALL clone every selected element (in stack order) into the
clipboard; Paste SHALL insert every clipboard element as a fresh clone (new ids) and select the
pasted set.

#### Scenario: A menu action on a multi-selection applies to every selected layer in one undo step

- **WHEN** 2+ layers are selected and the operator right-clicks one and chooses
  color / copy / cut / duplicate / delete / fit
- **THEN** the action applies to EVERY selected layer as a single undo step

#### Scenario: Right-clicking a layer outside the selection retargets to just it

- **WHEN** the right-clicked layer is NOT part of the current selection
- **THEN** the selection is replaced with just that layer and the menu acts on it (matching
  standard editors); WHEN the right-clicked layer IS in the selection THEN the whole selection is
  kept

#### Scenario: Paste inserts every copied/cut layer as a fresh clone

- **WHEN** several layers were copied or cut and Paste is chosen
- **THEN** all of them are pasted as fresh clones (new ids) after the current selection, and the
  pasted set becomes the selection

### Requirement: Copy / cut / paste keyboard shortcuts

The editor SHALL copy, cut, and paste the layer selection with Ctrl/Cmd+C, Ctrl/Cmd+X, and
Ctrl/Cmd+V, reusing the same selection-aware clipboard ops as the context menu, each as ONE undo
step. The shortcuts SHALL act on the whole current selection (copy / cut) or the whole clipboard
(paste) and SHALL consume the keydown when they perform an action. WHEN an
`input` / `textarea` / `select` / contentEditable is focused the shortcuts SHALL NOT fire (the
native text clipboard wins); WHEN nothing is selected (copy / cut) or the clipboard is empty
(paste) they SHALL do nothing and SHALL NOT consume the keydown (the browser default applies).

#### Scenario: Ctrl/Cmd+C / +X / +V act on the whole selection

- **WHEN** one or more layers are selected, no editable field is focused, and the operator presses
  Ctrl/Cmd+C, +X, or +V
- **THEN** copy / cut / paste runs on the whole selection as one undo step and the keydown is
  consumed

#### Scenario: The shortcut is suppressed while a text field is focused

- **WHEN** an `input` / `textarea` / `select` / contentEditable is focused
- **THEN** Ctrl/Cmd+C / +X / +V do not fire the layer clipboard (the native text clipboard wins)

#### Scenario: The shortcut is inert when there is nothing to act on

- **WHEN** Ctrl/Cmd+C or +X is pressed with nothing selected, or Ctrl/Cmd+V with an empty clipboard
- **THEN** nothing happens and the keydown is not consumed (the browser default applies)
