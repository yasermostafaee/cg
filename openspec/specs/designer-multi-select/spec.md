# designer-multi-select Specification

## Purpose

TBD - created by archiving change add-multi-select-editing. Update Purpose after archive.

## Requirements

### Requirement: Build a multi-selection with modifier clicks

The Designer SHALL let the operator build a multi-element selection from BOTH
the canvas and the timeline layer rows using shift or ctrl/meta as the
add/remove modifier, sharing ONE selection set (`selection: ReadonlySet<string>`)
so the two surfaces always reflect the same selection. A modifier-click on a hit
element SHALL toggle it in the set (add when absent, remove when present); a
plain (unmodified) click SHALL replace the selection with just that element; a
modifier-click on empty canvas SHALL be a no-op (it does not clear). The
existing locked / instance-unit hit rules are unchanged.

#### Scenario: Modifier-click toggles; plain click replaces; surfaces stay in sync

- **WHEN** the operator shift/ctrl-clicks elements on the canvas or on their
  timeline layer rows
- **THEN** each clicked element toggles in/out of the one shared selection set
  (a plain click instead replaces the selection with the single element
  clicked), and the canvas affordances and the highlighted layer rows reflect
  the same set on both surfaces

### Requirement: Multi-selection affordances and a single bounding box

WHEN more than one element is selected the canvas SHALL draw an individual
selection box around EACH selected shape and the timeline SHALL highlight every
selected layer row; the canvas SHALL NOT show a single group-spanning bounding
box. Each per-shape box SHALL be drawn 2px thick (1px thicker than before) for
readability. There is no group box to grab, so a press in empty space follows the
normal cursor-tool rule and does not drag the selection, while pressing on a
selected shape and dragging still moves the whole selection.

#### Scenario: Each selected shape has its own box and there is no group box

- **WHEN** more than one shape is selected
- **THEN** a selection box is drawn around each selected shape individually, NO
  single group-spanning bounding box is shown, and every selected layer row is
  highlighted

#### Scenario: The per-shape box is drawn thicker for readability

- **WHEN** more than one shape is selected
- **THEN** each per-shape selection box is drawn 1px thicker than before (2px)

#### Scenario: Empty space is not a group-drag handle

- **WHEN** the operator presses in empty space between selected shapes
- **THEN** the selection is not dragged (there is no group box to grab); pressing
  on a selected shape and dragging still moves the whole selection

### Requirement: Group move by a shared delta in one undo step

The Designer SHALL move every selected element by the SAME delta when a
multi-selection is dragged on the canvas (pressing any selected shape), as a single
undo step, and KEYFRAME-AWARE per member: a member with a track on the moved axis
gets a keyframe at the current frame holding the evaluated start value plus the
delta (B-005-safe), and a member with no track on that axis has its static base
written — the same rule single-element drag uses. Locked or hidden elements in the
selection SHALL NOT be moved, consistent with single-element drag. Group move is
position-only (group resize/rotate is out of scope), and it reuses the existing
`commitAnimatable` helper — the single-drag path is not modified.

#### Scenario: Dragging the selection moves all by one delta as one undo step

- **WHEN** a multi-selection is dragged on the canvas
- **THEN** all selected elements move by the same delta as ONE undo step, and
  locked/hidden elements in the set are not moved (consistent with single-element
  drag)

#### Scenario: An animated member keyframes at the playhead; an un-animated member moves its base

- **WHEN** a multi-selection is dragged and a selected member has a track on the
  moved axis
- **THEN** that member gets a keyframe at the current frame (as if dragged alone),
  while a member with no track on that axis has its static base written

#### Scenario: A keyframed member captures the evaluated start plus the delta

- **WHEN** a dragged member has a position track
- **THEN** the keyframe holds the evaluated-at-playhead start value plus the drag
  delta (B-005-safe — no revert to a stale base)

#### Scenario: Single-element drag is unchanged

- **WHEN** exactly one element is dragged
- **THEN** its behaviour, and the single-inspector diamonds, `commitAnimatable`,
  `togglePropertyKeyframe`, and `upsertKeyframe`, are unchanged (no regression to
  D-006 / B-005/006/007)

#### Scenario: Group keyframes play and export like single-authored ones

- **WHEN** a scene is played, previewed, or exported after a keyframe-aware group
  move
- **THEN** the resulting keyframes behave identically to ones authored via single
  selection (they are written through the same upsert path)

### Requirement: Shared-property multi editor across the selected kinds

WHEN more than one element is selected the inspector SHALL show a multi-selection
editor that exposes the properties COMMON to the selected elements' kinds, computed
by intersecting each kind's FULL editable-property set (the same `prop`s and sections
the single inspector exposes — transform incl. scale, plus stroke, border-radius,
drop-shadow, filter, fill, …), rendering each shared property with the SAME input
primitive the single-element inspector uses, grouped under the SAME section headers
and order as single selection — NOT a flat ad-hoc layout and NOT a transform-only
subset. For a homogeneous selection this is the full property set of that kind; for a
mixed selection it is the genuine overlap (text/ticker contribute only what they
share). The multi editor SHALL render keyframe diamonds per the "Keyframe diamonds in
the multi editor" requirement (D-054 — group editing is now keyframe-aware), not hide
them.

#### Scenario: Homogeneous shapes expose the full shape property set

- **WHEN** several elements of the same kind are selected (e.g. two ellipses)
- **THEN** the inspector exposes every property of that kind — scale, stroke,
  border-radius, drop-shadow, filter, … not just position/size/opacity — each grouped
  under its section

#### Scenario: A mixed selection exposes exactly the common properties

- **WHEN** a mixed-kind selection is made
- **THEN** the inspector exposes exactly the properties common to all selected kinds
  (rectangles + ellipses share the full shape set; text/ticker contribute only their
  genuine overlap), computed from the kinds' real editable-property sets

#### Scenario: Shared properties use the single-inspector primitives and grouping

- **WHEN** more than one element is selected
- **THEN** each shared property renders with the same input primitive as the
  single-element inspector (horizontal-drag number fields, colour controls) and is
  grouped under the same section headers in the same order, not a flat list

#### Scenario: United properties show their unit

- **WHEN** a shared property has a display unit
- **THEN** the multi editor shows that unit exactly as single selection does (opacity
  in `%`; every other united property shows its unit)

#### Scenario: Per-keyframe diamonds are shown in the multi editor

- **WHEN** the multi-selection editor is shown
- **THEN** keyframe diamonds are rendered for the shared keyframe-able properties (no
  longer hidden), per the "Keyframe diamonds in the multi editor" requirement

### Requirement: Mixed-value display and one-undo group edit

For each shared property the multi editor SHALL show the common value when every
selected element agrees, and a neutral "mixed" state (no coercion) when they differ.
A shared number field SHALL use the SAME input primitive as single selection —
horizontal drag-to-scrub AND live (onChange) updates while typing — applying each
intermediate value to EVERY selected element immediately and KEYFRAME-AWARE (via the
shared `commitAnimatable` fan-out: a member with a track on the property keyframes at
the current frame, a member without one writes its static base), WITHOUT a
per-tick/per-keystroke history boundary (so the burst time-coalesces), and SHALL set
ONE history boundary at the gesture/commit endpoint (drag release / Enter / blur) so
the whole edit is EXACTLY ONE undo entry. This unifies the field edit with the
canvas drag (D-054 Option B) so the same property never behaves differently between
them; the keyframe-free base write remains what the shared commit takes for
un-animated members. Single-selection editing is unchanged.

#### Scenario: Agreeing value is shown; differing values show a mixed state

- **WHEN** a shared property has the same value across all selected elements
- **THEN** the field shows that value; WHEN the values differ THEN the field shows a
  neutral "mixed" state and does not coerce them until edited

#### Scenario: Dragging a shared number field updates all selected live; release is one undo

- **WHEN** the operator drags a shared number field horizontally
- **THEN** every selected element updates live during the drag (realtime, like
  single selection), and the whole drag is ONE undo entry on release

#### Scenario: Typing updates all selected live; Enter/blur commits one undo entry

- **WHEN** the operator types into a shared number field
- **THEN** the value updates live on each keystroke across the selection, and the
  whole typed edit is ONE undo entry committed (a history boundary set) on Enter or
  blur, isolated from the next edit

#### Scenario: A field edit is keyframe-aware per member

- **WHEN** the operator edits a shared property and a selected member has a track for
  it
- **THEN** that member keyframes at the current frame while an un-animated member
  gets its static base — the same rule as the canvas drag — and the edit is still
  realtime and ONE undo on commit

#### Scenario: Escape ends editing without a separate discard (single-selection parity)

- **WHEN** the operator presses Escape while editing a shared number field
- **THEN** editing ends with the last live value (the live model has no separate
  discard — parity with single selection), and Ctrl+Z reverts the whole one-entry
  edit

#### Scenario: One undo reverts the whole edit across all selected (no per-tick spam)

- **WHEN** a committed multi edit (dragged or typed) is undone
- **THEN** a single undo reverts the whole edit across all selected elements — not
  one undo per tick or per keystroke

#### Scenario: The shared field is the same drag-scrub primitive as single selection

- **WHEN** a shared number field is shown
- **THEN** it is the SAME input primitive as single selection with drag-scrub
  enabled, not a type-to-edit-only field

#### Scenario: A mixed field edits the same live, single-undo way

- **WHEN** the operator edits a field that was showing the "mixed" state
- **THEN** it applies live to every selected element and commits ONE undo entry on
  the gesture endpoint (the mixed state is replaced by the committed value)

#### Scenario: Single-selection number-field behavior is unchanged

- **WHEN** exactly one element is selected
- **THEN** its number-field scrub/commit behavior is unchanged (no regression to the
  single-selection path)

### Requirement: Group delete of the whole selection

The Designer SHALL remove all selected elements in a single step when
Delete/Backspace is pressed with several elements selected (the existing
multi-aware `deleteSelection`, D-023), UNLESS an input, textarea, or
contentEditable is focused (the existing typing guard).

#### Scenario: Delete removes the whole selection in one step

- **WHEN** several elements are selected and Delete/Backspace is pressed with no
  text field focused
- **THEN** all selected elements are removed in one step (the existing
  multi-aware delete); WHEN an input/textarea/contentEditable is focused THEN
  the delete is suppressed

### Requirement: Single-selection parity (no regression)

WHEN exactly one element is selected the inspector, gizmo, and drag SHALL behave
exactly as before this change — the full single-element inspector, the
resize/rotate gizmo, and keyframe-aware drag. Reducing a multi-selection to one
element SHALL restore the single-element inspector; clearing the selection SHALL
show the inspector's empty state.

#### Scenario: One selected element behaves exactly as today

- **WHEN** exactly one element is selected
- **THEN** the inspector, gizmo, and drag behave exactly as today (no regression
  to single-selection editing)

#### Scenario: Reducing to one restores the single inspector; clearing empties it

- **WHEN** a multi-selection is reduced to one element
- **THEN** the full single-element inspector returns; WHEN the selection is
  cleared THEN the inspector shows its empty state

### Requirement: Keyframe diamonds in the multi editor

The multi editor SHALL render a keyframe diamond for each shared property that is
keyframe-able for EVERY selected element kind (gated by the D-051 registry
`isKeyframeable`), and SHALL NOT render one for a property that is not shared or not
keyframe-able across the whole selection. The diamond SHALL show an aggregate state
at the current frame: `at-frame` when every selected element has a keyframe there,
`empty` when none do, and a distinct THIRD `partial` state (a different colour) when
some do and some do not. Clicking the diamond SHALL toggle keyframes across the
selection as ONE undo entry: when all selected already have a keyframe at the current
frame it is removed from all, otherwise a keyframe is added to every selected element
that lacks one (via the existing evaluated-at-playhead path, B-005-safe). The single
inspector's diamond is unchanged (it never shows `partial`).

#### Scenario: A diamond shows only for properties keyframe-able across the whole selection

- **WHEN** more than one element is selected
- **THEN** a diamond renders for each shared property that is keyframe-able for every
  selected kind, and no diamond renders for a property that is not shared or not
  keyframe-able for some selected element (e.g. a gradient fill, or a property a
  mixed-kind member cannot keyframe)

#### Scenario: The aggregate diamond reflects all / none / partial

- **WHEN** a shared keyframe-able property's diamond is shown
- **THEN** it is `at-frame` when EVERY selected element has a keyframe at the current
  frame, `empty` when NONE do, and the distinct `partial` state when SOME do and some
  do not

#### Scenario: Clicking the diamond toggles keyframes across the selection in one undo

- **WHEN** the operator clicks a shared property's diamond AND all selected already
  have a keyframe at the current frame
- **THEN** the keyframe is removed from all; WHEN some or none do THEN a keyframe is
  added to every selected element that lacks one (capturing its evaluated-at-playhead
  value) — each as ONE undo entry across the selection
