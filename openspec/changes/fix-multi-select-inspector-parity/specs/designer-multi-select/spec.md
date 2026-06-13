# designer-multi-select

## MODIFIED Requirements

### Requirement: Shared-property multi editor across the selected kinds

WHEN more than one element is selected the inspector SHALL show a
multi-selection editor that exposes ONLY the properties COMMON to the selected
elements' kinds (the kind intersection), rendering each shared property with the
SAME input primitive the single-element inspector uses — the horizontal-drag
number field with its unit suffix, the colour control, etc. — grouped under the
SAME section headers and order as single selection (transform properties under a
Transform group, fill under its style group), NOT a flat ad-hoc layout. For a
homogeneous selection this is the full property set of that kind; for a mixed
selection it is the shared subset, at minimum the common transform — position
X/Y, width, height, rotation, opacity — and fill where every selected kind has
it. The multi editor SHALL NOT render per-keyframe controls (the diamonds):
group editing in v1 sets static values only and never adds or alters keyframes.

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

#### Scenario: Shared properties use the single-inspector primitives and grouping

- **WHEN** more than one element is selected
- **THEN** each shared property renders with the same input primitive as the
  single-element inspector (horizontal-drag number fields, colour controls) and
  is grouped under the same section headers in the same order (transform
  properties under Transform), not a flat list

#### Scenario: United properties show their unit

- **WHEN** a shared property has a display unit
- **THEN** the multi editor shows that unit exactly as single selection does
  (opacity in `%`; every other united property shows its unit)

#### Scenario: A mixed field keeps the correct primitive and unit

- **WHEN** a shared field's values differ across the selection
- **THEN** it still uses the correct primitive + unit and shows the neutral mixed
  state until edited (the D-041 mixed behaviour, rendered with the right control)

### Requirement: Multi-selection affordances and a single bounding box

WHEN more than one element is selected the canvas SHALL draw an individual
selection box around EACH selected shape and the timeline SHALL highlight every
selected layer row; the canvas SHALL NOT show a single group-spanning bounding
box. There is no group box to grab, so a press in empty space follows the normal
cursor-tool rule and does not drag the selection, while pressing on a selected
shape and dragging still moves the whole selection.

#### Scenario: Each selected shape has its own box and there is no group box

- **WHEN** more than one shape is selected
- **THEN** a selection box is drawn around each selected shape individually, NO
  single group-spanning bounding box is shown, and every selected layer row is
  highlighted

#### Scenario: Empty space is not a group-drag handle

- **WHEN** the operator presses in empty space between selected shapes
- **THEN** the selection is not dragged (there is no group box to grab); pressing
  on a selected shape and dragging still moves the whole selection

### Requirement: Group move by a shared delta in one undo step

The Designer SHALL move every selected element by the SAME delta when a
multi-selection is dragged on the canvas (pressing any selected shape), as a
single undo step. Locked or hidden elements in the selection SHALL NOT be moved,
consistent with single-element drag. Group move sets static positions only — it
does not add or alter keyframes (v1).

#### Scenario: Dragging the selection moves all by one delta as one undo step

- **WHEN** a multi-selection is dragged on the canvas
- **THEN** all selected elements move by the same delta as ONE undo step, and
  locked/hidden elements in the set are not moved (consistent with
  single-element drag)
