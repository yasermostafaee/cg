## ADDED Requirements

### Requirement: Repeater rows can enter in authored order

A Repeater SHALL optionally apply one shared entrance effect to its stamped row wrappers. Row zero
SHALL begin immediately and row N SHALL begin after `N × item delay`. The effect SHALL use the
existing Sequence edge/fade vocabulary, and its duration SHALL be independent of the delay between
rows.

#### Scenario: Author builds a league table one row at a time

- **WHEN** the author chooses an entrance, a 400 ms effect time and a 100 ms item delay
- **THEN** the first row starts immediately, the second starts at 100 ms and the fifth starts at
  400 ms
- **AND** each row completes its own entrance 400 ms after it starts

#### Scenario: Author keeps the historical presentation

- **WHEN** a Repeater was authored before entrance fields existed or its entrance is `none`
- **THEN** every stamped row is visible at rest immediately and no entrance animation is scheduled

#### Scenario: Playback pauses during the build

- **WHEN** playback pauses while staggered rows are entering and later resumes
- **THEN** every row continues from the same visual pose without wall-clock drift
- **AND** stop, replay and remove restore or tear down every row without orphan animation frames

#### Scenario: Row data changes during the build

- **WHEN** bound row values shrink or regrow within the stamped count during the entrance timeline
- **THEN** the existing positional live-value behavior remains intact
- **AND** any row that becomes visible adopts its current ordered entrance pose without restarting
  the other rows or delaying its child scope lifecycle
