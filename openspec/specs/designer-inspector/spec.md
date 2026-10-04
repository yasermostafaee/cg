# designer-inspector Specification

## Purpose

TBD - created by archiving change fix-inspector-input-selection-resync. Update Purpose after archive.

## Requirements

### Requirement: Inspector inputs reflect the currently-selected element

Every editable input in the inspector SHALL display the value of the
currently-selected element. When the selection changes to a different element, each
input SHALL re-initialise to the newly-selected element's value, even when the
previous and new elements share the same committed value and even if the previous
input held an uncommitted (in-progress) draft. An input SHALL NOT carry one element's
unsaved draft over to another element's display.

#### Scenario: Switching elements mid-edit shows the new element's value

- **WHEN** the operator types into element A's Data key input without committing
  (no Enter / blur) and then selects element B
- **THEN** the inspector shows element B's OWN Data key (its committed value), not
  element A's uncommitted draft

#### Scenario: The same stale-display fix applies to the other inspector inputs

- **WHEN** the operator types an uncommitted value into the element Name input, a
  field Title / Description / Value, or a stroke / shadow colour, and then selects a
  different element
- **THEN** each input shows the newly-selected element's own value, not the prior
  element's draft

### Requirement: A pending edit still commits to the previously-selected element

Changing the selection SHALL still commit a pending (typed-but-not-Entered) edit to
the element that was selected when the edit was made. Re-initialising the display for
the new element SHALL NOT discard or misattribute the previous element's edit.

#### Scenario: The pending data-key edit saves to the previous element

- **WHEN** the operator types a Data key into element A's input and then selects
  element B (which blurs A's input)
- **THEN** the typed key is saved to element A (its field/binding are created), and
  element B's input shows its own value

### Requirement: The text element's inspector exposes a font-weight control

The plain **text** element's inspector SHALL expose a font-weight control — a select of the supported weights (100..900, step 100) — inline beside the font-family and font-size controls, matching the control the ticker, sequence, and clock inspectors already have. Choosing a weight SHALL write `font.weight` (via the non-keyframe element-update path, like font-family) so the text renders at that weight identically in canvas, preview, and export. The control SHALL NOT be keyframe-able (no keyframe diamond) and SHALL be single-select-only (not offered as a shared/multi-edit field). An existing text element's authored `font.weight` SHALL be shown unchanged — there is no schema, render, or data change.

#### Scenario: The text inspector shows a 100–900 font-weight control

- **WHEN** a text element is selected
- **THEN** its inspector shows a font-weight control (a 100..900 select) inline beside the font-family / font-size controls, reflecting the element's current `font.weight`

#### Scenario: Choosing a weight updates the text and is not keyframe-able

- **WHEN** the operator chooses a weight in the text inspector
- **THEN** `font.weight` is written via the element-update path and the text renders at that weight (canvas / preview / export); no keyframe diamond renders for it and no keyframe track is created (it is non-keyframable, like font-family)

#### Scenario: An existing text weight is shown unchanged

- **WHEN** a text element authored before this change (with a `font.weight` already in the schema) is selected
- **THEN** its existing weight is shown in the new control unchanged — no schema change and no data migration

#### Scenario: Font-weight is single-select-only

- **WHEN** multiple elements are selected
- **THEN** font-weight is not offered as a shared/multi-edit field (single-select-only, consistent with font-family and alignment)

### Requirement: Unified alignment button-group across element kinds

The inspector SHALL render alignment using ONE shared button-group control (the text element's group is the model) for every kind that has alignment, so a later visual polish styles a single control. Clock and sequence SHALL render their horizontal align (start / center / end) with this button-group, replacing the previous dropdown, AND gain a vertical-align button-group (top / middle / bottom). The ticker SHALL gain a vertical-align button-group ONLY (it is a crawl — no horizontal align). The text element SHALL keep both its horizontal and vertical groups, unchanged. The horizontal button-group SHALL offer start / center / end only — `justify` stays text-SCHEMA-only and is never exposed in the control nor added to any other kind. Alignment (horizontal AND vertical) SHALL be NON-keyframe-able on every kind: each group writes via the element-update path (not the keyframe path), creates no keyframe track, and renders no keyframe diamond; and `align` / `verticalAlign` SHALL remain absent from `AnimatablePropertySchema`. Alignment SHALL be single-select-only (not offered in the multi-select editor), consistent with font-family and font-weight.

#### Scenario: Clock and sequence use the button-group (not a dropdown) plus a vertical group

- **WHEN** a clock or sequence element is inspected
- **THEN** its horizontal align is the shared start/center/end button-group (the dropdown is gone) AND a vertical-align button-group (top/middle/bottom) is shown; choosing either writes `align` / `verticalAlign` via the element-update path with no keyframe diamond and no track

#### Scenario: The ticker shows a vertical group only

- **WHEN** a ticker element is inspected
- **THEN** it shows a vertical-align button-group (top/middle/bottom) and NO horizontal-align control (a crawl has no horizontal alignment)

#### Scenario: Text keeps both groups and never exposes justify

- **WHEN** a text element is inspected
- **THEN** it shows the same horizontal (start/center/end) and vertical (top/middle/bottom) button-groups as before — `justify` remains in the schema but is never an option in the control

#### Scenario: Alignment is not keyframe-able anywhere

- **WHEN** alignment (horizontal or vertical) is shown for any kind (text / ticker / clock / sequence)
- **THEN** no keyframe diamond renders for it and `align` / `verticalAlign` are not members of `AnimatablePropertySchema`

### Requirement: Text padding inputs render four-in-a-row

The text element's padding controls SHALL render the four inputs (top, right, bottom, left) side-by-side in a single row, each a compact number cell carrying its own keyframe diamond, matching the Loopic reference (`D-048-textpadding-0.png`) — rather than one input per row. This is a layout change only: the stored values, the commit path, and the per-input keyframe behavior are unchanged.

#### Scenario: Padding shows four inputs in one row

- **WHEN** a text element with a padding section is inspected
- **THEN** its top / right / bottom / left padding inputs appear side-by-side in one row, each with its keyframe diamond, and editing any one commits exactly as before (no value or keyframe-behavior change)

### Requirement: Inspector toggles use a neutral active state, not a blue accent

The inspector's alignment button-groups and the sizing / auto-squeeze / text-wrap toggles SHALL show their active (selected/pressed) state with a neutral fill consistent with the properties panel, NOT the blue accent color, matching the Loopic reference (`D-045-align-0/1.png`). The active state remains clearly distinguishable; only its color changes (appearance only — no behavior change).

#### Scenario: An active align/toggle button is neutral, not blue

- **WHEN** an alignment button or a sizing / auto-squeeze / text-wrap toggle is in its active state
- **THEN** it is filled with the neutral properties-panel active color (not the blue accent), and selecting options still behaves exactly as before

### Requirement: More-text-options gear opens a font settings popover

The "More text options" gear in the text element's section SHALL open a small popover housing the existing font properties — font weight (100..900) and font style (normal / italic) — styled like the Loopic reference gear popover (`D-045-align-1.png`). The popover SHALL open on clicking the gear and close on an outside click or the Escape key (the existing color/fill popover pattern). The font-weight control that previously sat inline moves into this popover; both controls write `font.weight` / `font.style` via the element-update path and are non-keyframable (no keyframe diamond). It exposes ONLY these existing font props — no decoration / transform / variant (those do not exist in the schema). No schema, renderer, or stored-value change.

#### Scenario: The gear opens the popover with weight and style

- **WHEN** the operator clicks the "More text options" gear on a text element
- **THEN** a popover opens showing a font-weight control (100..900) and a font-style control (normal / italic), reflecting the element's current values

#### Scenario: Editing weight or style writes via the element-update path

- **WHEN** the operator changes font weight or font style in the popover
- **THEN** `font.weight` / `font.style` is written via the element update (the text re-renders at that weight/style) with no keyframe track created and no keyframe diamond shown

#### Scenario: The popover closes on outside click or Escape

- **WHEN** the popover is open and the operator clicks outside it or presses Escape
- **THEN** the popover closes

#### Scenario: Only existing font props are offered

- **WHEN** the popover is open
- **THEN** it offers only font weight and font style — no text-decoration, text-transform, or font-variant controls (those are not in the schema)

### Requirement: A control the element kind cannot honour is withheld, not hidden

The Inspector SHALL render a control that an element kind withholds — a Live Source's rotation
and opacity fields, and its Filter section — in place, disabled, carrying the reason as the
control's own tooltip, with the row dimmed as a whole. It SHALL NOT remove the control from the
panel. The reason SHALL come from the field registry, beside the decision that withholds the
control, so what is withheld and what the author is told cannot drift apart. A withheld field
SHALL NOT scrub, focus or commit.

#### Scenario: a plate's rotation and opacity are present and disabled with their reason

- **WHEN** a Live Source plate is selected
- **THEN** the Transform section shows the Rotation and Opacity fields, both disabled, each with
  a tooltip that begins "Withheld on a live plate" and states why
- **AND** a shape selected in the same session shows both fields enabled with no such tooltip

#### Scenario: the Filter section is a withheld header

- **WHEN** a Live Source plate is selected
- **THEN** the Filter section renders as a dimmed header tagged `withheld`, carrying the reason
  as its tooltip, with no expandable body
- **AND** a shape shows the ordinary expandable Filter section

### Requirement: Teaching and mechanism sit behind an `i`, at reading size

The Inspector SHALL place prose an author reads once — what a plate is on air, what the three loops
are, what a look is — behind an `i` control beside the thing it explains, opening the shared modal
at the app's message size with a capped reading measure. The `i` SHALL NOT hold a sentence that
names a remedy, a blocking condition or a refusal; those stay inline. When a sentence's kind is
unclear it SHALL stay inline.

#### Scenario: the Live Source panel's mechanism is one click away, and the state is inline

- **WHEN** a Live Source plate is selected
- **THEN** one line states that the plate is static and that its withheld controls say why
- **AND** the `i` beside it opens a dialog titled "Live plates on air" whose text describes the
  page composited below the pictures, a plate that paints nothing, and a frame painted just
  outside the rect — and contains no "hole"

### Requirement: No paragraph restates a placeholder, and a fact is a field

The Inspector SHALL NOT render a sentence whose content is already the placeholder or tooltip of
a control in the same section. A fact about the element — the video's source file, size, frame
conform and crop — SHALL be a labelled field, like `duration` above it, not a sentence.

#### Scenario: the sequence Items section no longer repeats the data-key placeholder

- **WHEN** a sequence element is selected and its Items section is open
- **THEN** the sentence "Give a text item a data key to make it operator-editable; without one
  it's static design-time text" is absent — the per-item data-key field's own placeholder says it

#### Scenario: video provenance is fields

- **WHEN** a video element imported from a source file is selected
- **THEN** the source filename, source size, the frame conform (when the rates differ) and the crop
  (when one was applied) each appear as a labelled row, not as one sentence

### Requirement: The inline text that remains has one legible default

Inline inspector text — a state and its remedy, an empty state, a caption — SHALL use one shared
size, line-height and measure that survive a narrow inspector, drawn from one stylesheet rather
than per-panel copies. The export-refusal block SHALL keep its danger treatment and SHALL read
louder than the text around it.

#### Scenario: the refusal block outranks the captions

- **WHEN** a Looks panel shows an export refusal beside its other text
- **THEN** the refusal heading and rows are set in the danger colour at no smaller than the
  inline default, and nothing around them is set larger
