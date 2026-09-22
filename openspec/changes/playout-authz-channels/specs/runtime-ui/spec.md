# runtime-ui

## ADDED Requirements

### Requirement: The channel strip is scoped to the principal, and read-only channels are shown

The console's channel list SHALL take the signed-in principal as an input at the one place the
list is derived, so that no surface downstream applies its own filter.

The strip SHALL list the channels the principal may operate. A channel the fixed bank declares
but the principal may NOT operate SHALL be shown READ-ONLY rather than hidden, because a channel
missing from the strip cannot be told apart from a station that does not have it.

A read-only channel SHALL remain selectable, because `read` is a real permission and a principal
is entitled to watch a channel they may not drive.

The console SHALL NOT re-derive the permission verdict. The permitted channels SHALL be the ones
the bridge computed with the shared predicate and published on `auth.state`, so that a control
the console offers and a command the bridge accepts are one judgement.

When authentication is off, or the bridge has not answered yet, the list SHALL NOT be narrowed
and no channel SHALL be marked read-only.

#### Scenario: The bank's channel survives the narrowing, marked read-only

- **WHEN** the station declares channels 1, 2 and 3, the bank is channel 1, and the principal is
  granted channel 2 only
- **THEN** the strip lists channels 1 and 2, channel 3 is absent, and channel 1 is labelled
  read-only while channel 2 is not

#### Scenario: A read-only tab is a tab, not a disabled control

- **WHEN** a channel is shown read-only
- **THEN** it renders as a selectable tab and is not disabled

#### Scenario: Authentication off narrows nothing

- **WHEN** the bridge does not authenticate
- **THEN** every declared channel is listed and none is marked read-only

### Requirement: A principal who may not operate sees no operator controls

The operator controls SHALL be ABSENT rather than disabled when the signed-in principal may not
operate the channel the console is scoped to, because a disabled control states the wrong fact:
it reads as "this row is not ready" when the truth is that the console is not theirs to press.

The console SHALL say so ONCE, in the operator's words, as a fact rather than a control — with no
click handler, no tab stop and no button role.

A verb the bridge leaves UNSCOPED SHALL be gated on the role alone and never on the selected
channel, so that an operator whose selected channel is not granted still has the emergency
silence and the remedy for a stranded live row.

When authentication is off, or the bridge has not answered yet, every control SHALL remain
exactly as it was before this change.

#### Scenario: The row verbs are absent, not disabled

- **WHEN** the principal may not operate the selected channel
- **THEN** the row offers no verbs at all, and none is present in a disabled state

#### Scenario: The reason is stated once, as a fact

- **WHEN** a principal holding only the `viewer` role is signed in
- **THEN** exactly one read-only statement is rendered, carrying `role="status"`, no button and
  no tab stop

#### Scenario: An operator is told nothing

- **WHEN** the signed-in principal may operate the selected channel
- **THEN** no read-only statement is rendered and every control is present
