# designer-playout-lifecycle

## ADDED Requirements

### Requirement: The hold loop is a state row, and a degenerate range reads as empty

The Playout section SHALL show the hold loop as a state row — the range `frames A → B` with a tag
reading `active`, `inert` or `empty` — followed by at most one short line naming the missing
condition and its remedy. The teaching that distinguishes the hold loop from the preview loop and
from Loop cycle SHALL sit behind an `i` on that row, at reading size. A range whose start is at or
past its out point SHALL read `empty` with "nothing to replay", whatever the mode.

#### Scenario: a manual hold reads inert and names the mode

- **WHEN** a composition with an out point is in `manual` mode
- **THEN** the hold loop row is tagged `inert` and the line beside it says a manual hold ignores
  the hold source and names auto-out or loop-cycle as the remedy

#### Scenario: a degenerate range reads empty

- **WHEN** the content start sits at the out point (frames 38 → 38)
- **THEN** the hold loop row is tagged `empty` and says there is nothing to replay

#### Scenario: an active hold loop states its guarantee inline

- **WHEN** a composition with a ticker is in `auto-out` with a content-driven hold
- **THEN** the row is tagged `active` and states that the content keeps running and never restarts
- **AND** the `i` explains the three loops (preview loop, Loop cycle, hold loop)
