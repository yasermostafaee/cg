# designer-inspector

## ADDED Requirements

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
