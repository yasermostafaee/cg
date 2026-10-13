## ADDED Requirements

### Requirement: A dialog's message is pinned outside its scrolling body

Every Runtime dialog SHALL surface a message about an action — why it was refused, or what
happened when it succeeded — through the `Modal` primitive's MESSAGE REGION, which SHALL be
rendered outside the dialog's scrolling body and immediately above the action row. A dialog
SHALL NOT render such a message into its own body content.

The region SHALL NOT move the body's scroll position when it appears, and a long message SHALL
NOT push the action row out of reach.

#### Scenario: A refusal is visible without scrolling

- **WHEN** a dialog whose body genuinely overflows shows a refusal, and the operator has
  scrolled that body back to the top **THEN** the message is fully within the viewport, and so
  is the action row it is pinned to

#### Scenario: A message never lives in the scroll container

- **WHEN** any Runtime dialog renders a message **THEN** the message element is a descendant of
  the pinned region and is not a descendant of the scrolling body, and the body contains no
  announcement of its own

#### Scenario: Showing a message does not move the operator's place

- **WHEN** a message appears while the operator has the dialog body scrolled **THEN** the body's
  scroll position is unchanged

### Requirement: A message's ROLE decides its treatment

A dialog SHALL declare what KIND of thing it is telling the operator and SHALL NOT declare how
it looks. The `message` contract SHALL accept DATA — a role, a sentence, and optionally the
specifics — and SHALL NOT accept caller-supplied markup or styling. Each role SHALL resolve to
exactly ONE treatment across every dialog, and that treatment SHALL be written down in exactly
one module.

Two roles exist: `refusal`, for why an action did not happen, and `notice`, for the neutral
outcome of one that did. Every foreground/background pairing SHALL meet WCAG AA (4.5:1) against
the surface it is drawn on.

#### Scenario: One role, one treatment, every dialog

- **WHEN** two different dialogs each show a message of the same role **THEN** both render the
  identical treatment, resolved from the shared table rather than chosen locally

#### Scenario: A refusal is announced; a neutral outcome is not

- **WHEN** a dialog shows a `refusal` **THEN** it is in the assertive announcement channel
  (`role="alert"`), because it is always the consequence of something the operator just did
- **WHEN** a dialog shows a `notice` **THEN** it is a `status`, not an alert

#### Scenario: A message's direction follows the message

- **WHEN** a message's text is Persian and the surrounding chrome is not **THEN** the message
  line renders right-to-left, because direction is resolved from the text (`dir="auto"`) rather
  than from the dialog

### Requirement: A modal message region cannot be bypassed silently

The repository SHALL enforce the message region structurally rather than by convention, in the
same way it already enforces its control primitives.

#### Scenario: A styled message cannot reach the region

- **WHEN** a dialog passes caller-supplied markup to the `message` contract **THEN** the build
  fails to typecheck

#### Scenario: A message rendered into a dialog's body is rejected at lint

- **WHEN** a renderer file outside `ui/` writes an assertive announcement inside a `<Modal>`
  subtree **THEN** lint reports an error naming the message region as the required path
