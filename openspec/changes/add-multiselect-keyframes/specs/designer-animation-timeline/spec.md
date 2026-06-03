## ADDED Requirements

### Requirement: Click a point opens the Keyframe Inspector

The timeline SHALL open the Keyframe Inspector on a single click of a keyframe
diamond — or of the segment line between two points, which targets the segment's
start point — selecting that point. No double-click is required.

#### Scenario: Click a diamond opens the inspector
- **WHEN** the operator clicks a keyframe diamond
- **THEN** that point is selected and the Keyframe Inspector opens for it

#### Scenario: Click a segment opens the inspector for its start point
- **WHEN** the operator clicks the line between two points
- **THEN** the Keyframe Inspector opens for the left (start) point

### Requirement: Multi-select keyframes with batch easing

The timeline SHALL let the operator select multiple keyframes (Shift / Ctrl /
Cmd + click adds or toggles a point) and SHALL highlight every selected point.
`Delete` SHALL remove all selected points. When more than one point is selected,
the Keyframe Inspector SHALL hide the per-point frame / value / property fields
and SHALL show only the easing editor — applied to every selected point — and a
"Remove keyframes" button. With exactly one point selected it SHALL show the full
single-point detail.

#### Scenario: Shift-click accumulates a selection
- **WHEN** the operator clicks one point, then Shift-clicks another
- **THEN** both are selected and highlighted

#### Scenario: Multi-select inspector shows only shared easing
- **WHEN** two or more points are selected
- **THEN** the inspector shows the easing editor and a "Remove keyframes" button
  and hides the frame / value / property fields

#### Scenario: Easing applies to all selected
- **WHEN** several points are selected and the operator changes the easing curve
- **THEN** every selected point receives that curve

#### Scenario: Delete removes all selected
- **WHEN** several points are selected and the operator presses Delete
- **THEN** all of them are removed
