# designer-multi-select

## MODIFIED Requirements

### Requirement: Shared-property multi editor across the selected kinds

WHEN more than one element is selected the inspector SHALL show a
multi-selection editor that exposes the properties COMMON to the selected
elements' kinds, computed by intersecting each kind's FULL editable-property set
(the same `prop`s and sections the single inspector exposes — transform incl.
scale, plus stroke, border-radius, drop-shadow, filter, fill, …), rendering each
shared property with the SAME input primitive the single-element inspector uses,
grouped under the SAME section headers and order as single selection — NOT a flat
ad-hoc layout and NOT a transform-only subset. For a homogeneous selection this is
the full property set of that kind; for a mixed selection it is the genuine
overlap (text/ticker contribute only what they share). The multi editor SHALL NOT
render per-keyframe controls (the diamonds): group editing sets static values only
and never adds or alters keyframes.

#### Scenario: Homogeneous shapes expose the full shape property set

- **WHEN** several elements of the same kind are selected (e.g. two ellipses)
- **THEN** the inspector exposes every property of that kind — scale, stroke,
  border-radius, drop-shadow, filter, … not just position/size/opacity — each
  grouped under its section

#### Scenario: A mixed selection exposes exactly the common properties

- **WHEN** a mixed-kind selection is made
- **THEN** the inspector exposes exactly the properties common to all selected
  kinds (rectangles + ellipses share the full shape set; text/ticker contribute
  only their genuine overlap), computed from the kinds' real editable-property
  sets

#### Scenario: Shared properties use the single-inspector primitives and grouping

- **WHEN** more than one element is selected
- **THEN** each shared property renders with the same input primitive as the
  single-element inspector (horizontal-drag number fields, colour controls) and
  is grouped under the same section headers in the same order, not a flat list

#### Scenario: United properties show their unit

- **WHEN** a shared property has a display unit
- **THEN** the multi editor shows that unit exactly as single selection does
  (opacity in `%`; every other united property shows its unit)

#### Scenario: Per-keyframe diamonds are hidden in the multi editor

- **WHEN** the multi-selection editor is shown
- **THEN** the per-keyframe controls (the diamonds) are hidden, and group editing
  sets static values only without adding or altering keyframes

### Requirement: Mixed-value display and one-undo group edit

For each shared property the multi editor SHALL show the common value when every
selected element agrees, and a neutral "mixed" state (no coercion) when they
differ. A typed edit of a shared number field SHALL update the field live on
keystroke (onChange) but record a history entry ONLY on Enter or blur — applying
the new value to EVERY selected element as a single undo step via the
keyframe-free base-value path (one history transaction per COMMITTED edit, not
one per keystroke), and the canvas and inspector SHALL reflect the committed
change.

#### Scenario: Agreeing value is shown; differing values show a mixed state

- **WHEN** a shared property has the same value across all selected elements
- **THEN** the field shows that value; WHEN the values differ THEN the field
  shows a neutral "mixed" state and does not coerce them until edited

#### Scenario: A typed edit commits one history entry on Enter/blur across all

- **WHEN** the operator edits a shared number field
- **THEN** keystrokes update the value live but ONLY Enter or blur records a
  single history entry, and one undo reverts the whole edit across all selected
  elements (parity with single-selection commit-on-blur)

#### Scenario: A mixed field commits the same single-undo way

- **WHEN** the operator edits a field that was showing the "mixed" state
- **THEN** the edit commits on Enter/blur as one undo entry applied to every
  selected element (the mixed state is replaced by the committed value)

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
