# designer-animation-timeline

## ADDED Requirements

### Requirement: Reorder layers by dragging a timeline row

Dragging a timeline layer row up or down by its name region SHALL reorder that element within its sibling set, changing the z-stack so the displayed top→bottom order maps to descending `zIndex` (the top row is front-most). The gesture is pointer-based (no drag-and-drop library), matching the existing keyframe / lifespan drags: a pointer movement below a small threshold (~4px) leaves the existing click-to-select behavior intact, and only past the threshold does a reorder drag begin (capturing the pointer). While dragging, a horizontal drop-indicator line SHALL be shown at the target gap (above or below the hovered row), visible only during an active drag. On release, when the target position differs from the origin the element SHALL be moved and its sibling set's `zIndex` renumbered (as one undo entry); a release at the origin position SHALL be a no-op. The reorder is confined to the dragged element's own sibling set — it MUST NOT move an element across layers or into/out of a container. Both the canvas and timeline derive from the same element list, so the reorder is reflected in both.

#### Scenario: Dragging a row to a new position changes the z-stack

- **WHEN** the operator drags a layer row past the start threshold and releases it over a different gap in the list
- **THEN** the element moves to that position in the top→bottom order and the sibling set's `zIndex` is renumbered so the top row has the highest `zIndex` (front-most) and the bottom row the lowest, and the rendered paint order (children sorted ascending by `zIndex`) matches the new order

#### Scenario: A horizontal drop indicator marks the target gap

- **WHEN** a reorder drag is active
- **THEN** a horizontal indicator line is shown at the gap where the row would drop (above or below the hovered row), and it is hidden when no drag is active

#### Scenario: Below-threshold press still selects

- **WHEN** the operator presses a layer row's name and releases without moving past the start threshold
- **THEN** no reorder happens and the row's normal click-to-select behavior stands

#### Scenario: Dropping at the origin is a no-op

- **WHEN** the operator drags a row and releases it at its original position
- **THEN** nothing changes — no reorder, no `zIndex` change, and no undo entry is added

#### Scenario: A single undo reverts the reorder

- **WHEN** a reorder has been applied
- **THEN** one undo restores the previous order and `zIndex` values

#### Scenario: Reorder stays within the sibling set

- **WHEN** the operator drags a row toward a position that would fall outside its own sibling set (another layer or another container's children)
- **THEN** the element is reordered only within its own siblings (clamped to that set) and is never moved across layers or into/out of a container
