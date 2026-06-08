## ADDED Requirements

### Requirement: Delete/Backspace removes the selection (keyframe precedence)

Pressing **Delete** or **Backspace** SHALL remove the current selection, handled
globally so it works whether focus is on the canvas or the timeline. Because
clicking a keyframe selects **both** the keyframe and its parent layer/shape, the
key SHALL apply a precedence: when **any** keyframe is selected it SHALL delete
**all** selected keyframes and leave the layer/shape; only when **no** keyframe is
selected SHALL it delete **all** selected layers/shapes. The key SHALL be ignored
when an editable field is focused (`input` / `textarea` / `select` /
contentEditable), so typing Delete in a field never deletes a layer. The deletion
SHALL be undoable as a single step, and SHALL be a no-op when nothing is selected.

#### Scenario: Keyframe selected → the keyframe is deleted, not the layer

- **WHEN** a keyframe is selected (which also selects its parent layer/shape) and
  the operator presses Delete or Backspace
- **THEN** the selected keyframe is removed and the parent layer/shape remains

#### Scenario: No keyframe selected → the selected layer/shape is deleted

- **WHEN** a layer/shape is selected, no keyframe is selected, and the operator
  presses Delete or Backspace
- **THEN** the selected layer/shape is removed

#### Scenario: Multi-select deletes all of the prioritised kind

- **WHEN** several keyframes are selected and Delete is pressed
- **THEN** all selected keyframes are removed; **and WHEN** instead several
  layers/shapes are selected with no keyframe selected
- **THEN** all selected layers/shapes are removed

#### Scenario: Editable field focused → nothing is deleted

- **WHEN** an `input` / `textarea` / `select` / contentEditable element is focused
  and the operator presses Delete or Backspace
- **THEN** no layer/shape or keyframe is deleted (the keypress edits the field)

#### Scenario: Delete is a single undo step

- **WHEN** a Delete removes one or more keyframes (or layers/shapes)
- **THEN** a single undo restores everything that delete removed
