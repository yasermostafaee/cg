## ADDED Requirements

### Requirement: Repeater exit and canvas motion use the authored row effects

A Repeater SHALL expose an optional exit effect with independent entrance and exit durations and a
shared row delay. An absent exit duration SHALL inherit the previous shared effect duration. Canvas playback,
Preview and output SHALL use the same motion. The enclosing composition SHALL await row exits before
closing its background. Existing Repeaters without an exit SHALL retain their prior behavior.

#### Scenario: Operator closes a built table

- **WHEN** the operator stops a Repeater with an authored exit
- **THEN** rows exit last-to-first by default and the background outro follows their completion
- **AND** pause/resume freezes and continues the exit while reset/remove settles pending exits

#### Scenario: Author chooses row exit order independently of the movement direction

- **WHEN** the author opens Item effects
- **THEN** Exit order offers Last to first and First to last, independently of the exit effect
- **AND** entrance always follows list order, so a column of teams builds top-to-bottom
- **AND** the selected exit order applies to Canvas, Preview and exported output

#### Scenario: Author checks the item motion on canvas

- **WHEN** the author plays or scrubs the composition timeline
- **THEN** the canvas samples the same row entrance and exit transforms as Preview

#### Scenario: Operator stops during an unfinished build

- **WHEN** Stop interrupts the staggered entrance
- **THEN** partly visible rows leave from their current pose and rows that have not entered stay
  hidden, without flashing at rest before the exit
- **AND** hidden surplus or not-yet-entered rows add no empty delay slots before the visible exits

#### Scenario: Author chooses a faster close than open

- **WHEN** entrance time is 600 ms and exit time is 200 ms
- **THEN** every row enters over 600 ms and exits over 200 ms using the same configured row delay
- **AND** changing exit time does not change entrance time

#### Scenario: A Sequence page contains the Repeater

- **WHEN** Stop closes a Sequence showing a composition containing Repeater item exits
- **THEN** the current page awaits its row exits before its own page exit
- **AND** pause, replay and removal settle or cancel that wait without changing normal page turns

#### Scenario: A finite Sequence finishes its final page naturally

- **WHEN** the last page finishes its dwell on the last configured pass
- **THEN** its row exit finishes before the page exit and before content completion is signalled
- **AND** the enclosing auto-out plays its background outro without revealing the completed page again

#### Scenario: An authored exit lasts longer than the default watchdog

- **WHEN** eighteen visible rows exit with a two-second stagger and a 400 ms effect
- **THEN** their complete 34.4-second exit is awaited, including inside a Sequence page
- **AND** pause time consumes none of the finite watchdog budget
- **AND** a genuinely stranded owner still emits a timeout and allows the background to close after
  its reported finite duration plus safety margin; replay/removal cancel the superseded guard

### Requirement: Repeater position can drive presentation without editable rank data

Text SHALL offer an explicit automatic row-number setting, with authored digit formatting. Repeater
SHALL optionally paint every second row with an authored fill. Neither feature SHALL require editable
rank data or hidden template-specific fields.

#### Scenario: Team order changes

- **WHEN** a row-number text is repeated and the operator reorders teams
- **THEN** ranks remain one through the visible row count, and no rank input or Excel column exists

#### Scenario: Alternating rows are authored

- **WHEN** an author sets the Repeater alternating row fill
- **THEN** every second row uses that background consistently in Canvas, Preview and output

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
