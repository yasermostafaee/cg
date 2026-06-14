# designer-multi-select

## MODIFIED Requirements

### Requirement: Mixed-value display and one-undo group edit

For each shared property the multi editor SHALL show the common value when every
selected element agrees, and a neutral "mixed" state (no coercion) when they
differ. A shared number field SHALL use the SAME input primitive as single
selection — horizontal drag-to-scrub AND live (onChange) updates while typing —
applying each intermediate value to EVERY selected element immediately via the
keyframe-free base-value path WITHOUT a per-tick/per-keystroke history boundary
(so the burst time-coalesces in the store), and SHALL set ONE history boundary at
the gesture/commit endpoint (drag release / Enter / blur) so the whole edit is
EXACTLY ONE undo entry, isolated from the next edit. This supersedes D-050's
deferred commit-on-blur model (onChange was visual-only and drag-scrub was
removed); single-selection editing is unchanged, and group editing stays
keyframe-free (keyframe-aware group editing is D-054).

#### Scenario: Agreeing value is shown; differing values show a mixed state

- **WHEN** a shared property has the same value across all selected elements
- **THEN** the field shows that value; WHEN the values differ THEN the field
  shows a neutral "mixed" state and does not coerce them until edited

#### Scenario: Dragging a shared number field updates all selected live; release is one undo

- **WHEN** the operator drags a shared number field horizontally
- **THEN** every selected element updates live during the drag (realtime, like
  single selection), and the whole drag is ONE undo entry on release

#### Scenario: Typing updates all selected live; Enter/blur commits one undo entry

- **WHEN** the operator types into a shared number field
- **THEN** the value updates live on each keystroke across the selection, and the
  whole typed edit is ONE undo entry committed (a history boundary set) on Enter
  or blur, isolated from the next edit

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
- **THEN** its number-field scrub/commit behavior is unchanged (no regression to
  the single-selection path)

#### Scenario: Group editing stays keyframe-free

- **WHEN** a shared number field is edited (dragged or typed)
- **THEN** every selected element's value is written as a static base value and no
  keyframe is created or altered (keyframe-aware group editing is D-054)
