## ADDED Requirements

### Requirement: Per-keyframe cubic-bézier easing

The runtime SHALL support an optional custom cubic-bézier easing
`[x1, y1, x2, y2]` on a keyframe. When set, the runtime and the Designer's
preview SHALL ease the keyframe's outgoing segment through that curve; when
absent they SHALL use the keyframe's named `easing` (`step` always snaps). The
bézier's time components (x1, x2) SHALL be clamped to [0, 1]. Scenes authored
before this field SHALL remain valid and play unchanged.

#### Scenario: A custom curve drives interpolation
- **WHEN** a keyframe has `bezier = [0.42, 0, 0.58, 1]` and the playhead is in
  its outgoing segment
- **THEN** the interpolated value follows that ease-in-out curve, matching the
  canvas and the exported output

#### Scenario: No bézier falls back to the named easing
- **WHEN** a keyframe has no `bezier`
- **THEN** interpolation uses its named `easing` exactly as before

### Requirement: Graphical easing editor in the Keyframe Inspector

The Keyframe Inspector SHALL keep the element, property, frame, and value fields,
and SHALL present the easing as a **Keyframe interpolation** editor: a Preset
dropdown (Linear, Ease In, Ease Out, Ease In-Out, Sine, Custom), a curve graph
(progress vs. time) showing the bézier with two draggable control handles, and
editable P1 and P2 X/Y fields. Choosing a preset SHALL set the curve and control
points; dragging a handle or editing a P1/P2 field SHALL update the curve and
SHALL show "Custom" when the curve no longer matches a preset.

#### Scenario: Choosing a preset
- **WHEN** the operator selects the "Sine" preset
- **THEN** the curve and P1/P2 fields update to the sine control points and the
  keyframe eases through that curve

#### Scenario: Dragging a control handle
- **WHEN** the operator drags the P1 handle on the curve graph
- **THEN** the curve and the P1 X/Y fields update, the preset shows "Custom",
  and the keyframe's easing follows the new curve

#### Scenario: Editing a control-point field
- **WHEN** the operator types a new P2 X value
- **THEN** the handle and curve move accordingly (the X value clamped to [0, 1])
