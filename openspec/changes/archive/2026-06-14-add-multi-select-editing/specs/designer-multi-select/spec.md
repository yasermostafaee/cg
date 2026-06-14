# designer-multi-select

## ADDED Requirements

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

WHEN more than one element is selected the canvas SHALL mark every selected
element with a selected affordance, the timeline SHALL highlight every selected
layer row, and the canvas SHALL show ONE bounding-box gizmo spanning the union
of the selected elements' boxes — move only, with no resize/rotate handles in
v1.

#### Scenario: Each selected element is marked and one bounding box is shown

- **WHEN** more than one element is selected
- **THEN** every selected element shows a selected affordance on the canvas and
  its layer row is highlighted, and a single bounding box spanning the whole
  selection is shown (with no resize/rotate handles)

### Requirement: Group move by a shared delta in one undo step

The Designer SHALL move every selected element by the SAME delta when a
multi-selection is dragged on the canvas (any selected element or the bounding
box), as a single undo step. Locked or hidden elements in the selection SHALL
NOT be moved, consistent with single-element drag. Group move sets static
positions only — it does not add or alter keyframes (v1).

#### Scenario: Dragging the selection moves all by one delta as one undo step

- **WHEN** a multi-selection is dragged on the canvas
- **THEN** all selected elements move by the same delta as ONE undo step, and
  locked/hidden elements in the set are not moved (consistent with
  single-element drag)

### Requirement: Shared-property multi editor across the selected kinds

WHEN more than one element is selected the inspector SHALL show a
multi-selection editor that exposes ONLY the properties COMMON to the selected
elements' kinds, computed by intersecting each kind's editable-property set
(kind-driven — no hardcoded pairwise kind combinations). For a homogeneous
selection this is the full property set of that kind; for a mixed selection it
is the shared subset, at minimum the common transform — position X/Y, width,
height, rotation, opacity — and fill where every selected kind has it. The multi
editor SHALL NOT render per-keyframe controls (the diamonds): group editing in
v1 sets static values only and never adds or alters keyframes.

#### Scenario: Inspector shows only the common properties

- **WHEN** more than one element is selected
- **THEN** the inspector shows a multi-selection editor exposing only the
  properties common to the selected kinds — the full kind property set for a
  homogeneous selection, or the shared subset (at minimum position X/Y, width,
  height, rotation, opacity, and fill where all selected kinds have it) for a
  mixed selection

#### Scenario: Per-keyframe diamonds are hidden in the multi editor

- **WHEN** the multi-selection editor is shown
- **THEN** the per-keyframe controls (the diamonds) are hidden, and group
  editing sets static values only without adding or altering keyframes

### Requirement: Mixed-value display and one-undo group edit

For each shared property the multi editor SHALL show the common value when every
selected element agrees, and a neutral "mixed" state (no coercion) when they
differ. Editing a shared field SHALL apply the new value to EVERY selected
element as a single undo step, fanning out over the existing per-element store
writes (the keyframe-free base-value path, not the keyframe-creating commit),
and the canvas and inspector SHALL reflect the change.

#### Scenario: Agreeing value is shown; differing values show a mixed state

- **WHEN** a shared property has the same value across all selected elements
- **THEN** the field shows that value; WHEN the values differ THEN the field
  shows a neutral "mixed" state and does not coerce them until edited

#### Scenario: Editing a shared field applies to all as one undo step

- **WHEN** the operator edits a shared property with several elements selected
- **THEN** the new value applies to every selected element as ONE undo step and
  the canvas and inspector reflect it

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
