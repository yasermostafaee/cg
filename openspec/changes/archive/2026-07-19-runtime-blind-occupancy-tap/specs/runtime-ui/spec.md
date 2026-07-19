# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: An unverifiable row says WHY it cannot be verified

A row that cannot be verified SHALL say which cause applies. A row can become unverifiable for
reasons that call for opposite operator responses, and it MUST NOT describe one as if it were the
other.

When a LINK has dropped, the item's fate is unknown and restoring the link is the remedy. When
the link is UP but the controller has never received any occupancy signal from the playout
server, nothing was sent for the item and the graphic is most likely still on air, untouched —
here restoring the link is not the remedy, and describing the graphic in the past tense
misstates what the operator is looking at. Both mis-readings push toward the unsafe response:
treating a live graphic as gone, and sending an engineer to restart a playout server that is
working.

An unverifiable row SHALL therefore carry wording that matches its cause. It SHALL keep the same
muted presentation in both cases — never the broadcast-red on-air treatment, and never a
different tone that would fragment a vocabulary the operator has already learned — so that only
the words differ. The wording for the never-heard-from case SHALL read as an open question
rather than a past-tense claim, and SHALL name the missing occupancy signal and its remedy
rather than a reconnect.

#### Scenario: A row unverifiable from a missing occupancy signal reads as a question

- **WHEN** an item is unverifiable because the controller has never received an occupancy signal
- **THEN** the row asks whether it is on air rather than stating that it was, and explains that
  nothing was sent and that the graphic is likely still on air

#### Scenario: A row unverifiable from a dropped link keeps its own wording

- **WHEN** an item is unverifiable because a link dropped
- **THEN** its existing wording is unchanged, naming the link that dropped and the reconnect

#### Scenario: Both causes share one muted presentation

- **WHEN** a row is unverifiable for either cause
- **THEN** it renders in the same muted state, never the broadcast-red on-air treatment
