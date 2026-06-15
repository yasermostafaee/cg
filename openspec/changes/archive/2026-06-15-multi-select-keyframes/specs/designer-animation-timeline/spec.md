## ADDED Requirements

### Requirement: Click to open the Keyframe Inspector

The Designer SHALL open the Keyframe Inspector on a single click of a keyframe
point or of the interpolation segment between two points (the segment opens its
start point). A double-click SHALL NOT be required. Clicking a point SHALL also
scrub the playhead to it.

#### Scenario: Single click opens the inspector

- **WHEN** the operator clicks a keyframe point
- **THEN** the Keyframe Inspector opens for that point and the playhead scrubs
  to its frame

#### Scenario: Clicking a segment opens its start point

- **WHEN** the operator clicks the line between two points
- **THEN** the Keyframe Inspector opens for the segment's start (left) point

### Requirement: Multi-select keyframes for shared easing

The Designer SHALL let the operator select multiple keyframes by Shift/Ctrl/Cmd-
clicking points (toggling each in the selection), and SHALL highlight every
selected point on the timeline. When more than one point is selected, the
Keyframe Inspector SHALL hide the per-point frame, value, and property fields and
show only the easing editor; applying an easing change SHALL set it on every
selected point. The remove action SHALL be labelled "Remove keyframes" and SHALL
remove all of them. Pressing Delete SHALL remove every selected point.

#### Scenario: Shift-click accumulates a multi-selection

- **WHEN** the operator clicks one point, then Shift-clicks another
- **THEN** both points are selected and highlighted

#### Scenario: Multi-select inspector shows only shared easing

- **WHEN** two or more points are selected
- **THEN** the inspector hides frame/value/property and shows the easing editor
  plus a "Remove keyframes" button

#### Scenario: Easing change applies to all selected

- **WHEN** several points are selected and the operator changes the easing curve
- **THEN** every selected point receives that curve

#### Scenario: Delete removes all selected

- **WHEN** several points are selected and the operator presses Delete
- **THEN** all of them are removed

#### Scenario: Mixed easings show a warning

- **WHEN** the selected points do not all share the same easing curve
- **THEN** the inspector shows a warning ("There are multiple different easings
  selected") and the curve editor shows a neutral line until the operator picks
  one, which then applies to all
