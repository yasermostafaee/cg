# designer-live-source — delta (D-157, 2026-08-26)

## ADDED Requirements

### Requirement: An element blocking the export is MARKED on the canvas

Every element that is the subject of an ERROR-severity preflight issue SHALL be marked on the canvas,
whether or not it is selected, and the mark SHALL clear as soon as the geometry stops producing the
issue.

The mark SHALL use the design system's existing `danger` treatment and SHALL NOT be confusable with
the selection outline or a hover state. Colour SHALL NOT be the only channel: the mark SHALL also
carry a non-chromatic signal and an accessible description naming the problem.

Where an issue names TWO participants — an overlap files one issue per element — BOTH SHALL be marked.

The mark SHALL be driven by the live preflight output, never by selection, and SHALL NOT intercept
pointer input.

#### Scenario: Both overlapping boxes are marked

- **WHEN** two Live Sources overlap **THEN** BOTH participants are marked on the canvas, not just one
- **WHEN** either is inspected **THEN** its mark carries the issue's own message as an accessible
  description

#### Scenario: The mark is independent of selection

- **WHEN** an offending element is not selected **THEN** it is still marked
- **WHEN** an element is selected but has no error **THEN** it carries the selection outline and no
  error mark

#### Scenario: The mark clears when the geometry is fixed

- **WHEN** the author moves the boxes apart **THEN** the marks disappear without any further action

#### Scenario: An off-frame box is marked the same way

- **WHEN** a Live Source is partly outside the frame **THEN** that box is marked, with its own message

#### Scenario: A clean composition marks nothing

- **WHEN** a composition has no error-severity issues **THEN** no element is marked

### Requirement: A blocked Export names the offender and opens the way to the full reason

The Export controls SHALL NOT be inert when validation errors block them. They SHALL remain fully
operable, and a press SHALL open the Issues panel and select the offending elements.

⚠ They SHALL NOT be marked `aria-disabled` either. A control that announces itself as unavailable
tells a screen-reader user not to press the one thing that would explain the problem — this
requirement's own defect, aimed at the users least able to work around it. The refusal SHALL reach
assistive technology as the control's accessible DESCRIPTION, which is possible only because the
control is enabled; its accessible NAME SHALL stay canonical, so every surface can still find it.

The refusal SHALL name the number of errors and the first offender. No string that cannot be rendered
SHALL remain in the component.

Where the export is unavailable because there is NO composition open, the control SHALL be genuinely
disabled: there is no issue to explain.

#### Scenario: Pressing a blocked Export explains it

- **WHEN** validation errors block the export and the author presses Export **THEN** the Issues panel
  opens, the offending elements are selected, and the refusal names the count and the first offender
- **WHEN** it is pressed **THEN** no export runs

#### Scenario: The refusal is one action from the button

- **WHEN** the author presses a blocked Export **THEN** the full message is on screen in ONE action
  from the control they pressed

#### Scenario: Assistive technology hears the reason, not "unavailable"

- **WHEN** the export is blocked **THEN** the control is neither `disabled` nor `aria-disabled`, and
  the refusal is exposed as its accessible description
- **WHEN** it is blocked **THEN** its accessible NAME is unchanged, so the control remains findable

#### Scenario: No composition is a genuinely disabled control

- **WHEN** no composition is open **THEN** the Export control is disabled and says so, because there
  is nothing to explain

#### Scenario: A clean composition exports

- **WHEN** there are no error-severity issues **THEN** the Export control is live and pressing it runs
  the export
