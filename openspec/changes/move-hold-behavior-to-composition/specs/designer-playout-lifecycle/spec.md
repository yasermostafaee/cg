# designer-playout-lifecycle — delta (D-187)

## ADDED Requirements

### Requirement: The composition owns Hold rendering

The Playback Inspector SHALL expose one composition-level Freeze/Loop-middle choice. Video and
Lottie SHALL NOT expose a second On hold selector. Under Freeze, every element and the root cursor
SHALL park at the composition Out point. A Follow Video SHALL NOT expose or consume an authored
Freeze-frame override. Under Loop middle, the Inspector SHALL expose the eligible repeat
participants.

#### Scenario: Freeze has one boundary for every element

- **GIVEN** Content start is earlier than Out point
- **WHEN** the composition enters Freeze Hold with native and Follow-media elements
- **THEN** every element keeps its Out-point-derived picture
- **AND** the root cursor remains at Out point
- **AND** no per-media control can select another Freeze frame

#### Scenario: Loop middle is authored once

- **WHEN** an author selects Loop middle for a composition
- **THEN** Playback shows a repeat-participant checklist
- **AND** individual Video and Lottie Inspectors show no On hold selector

### Requirement: Mixed Hold playback uses independent element time

Checked participants SHALL repeat `[Content start → Out point]`. Unchecked animated elements and
media SHALL advance once to their authored end without being repainted by a root-cursor wrap.
Content drivers SHALL continue on their own clocks without restart.

#### Scenario: One element repeats while another finishes

- **GIVEN** two animated elements and only the first is checked
- **WHEN** Hold lasts beyond one Middle pass
- **THEN** the first element repeats from Content start
- **AND** the second element advances monotonically to its end and never jumps backwards

#### Scenario: Content crosses a wrap

- **WHEN** a ticker or sequence is running while the Middle cursor wraps
- **THEN** its pass/item state continues without reset or repeat consumption

### Requirement: Leaving Hold does not replay completed tails

When Hold ends, selected participants SHALL leave the loop and play their Outro once. An unchecked
participant that already advanced through its tail SHALL remain at its end and SHALL NOT replay that
tail. The composition SHALL not settle before a still-running unchecked tail reaches its end.

#### Scenario: A short Hold leaves while the tail is running

- **WHEN** Hold ends before an unchecked tail reaches its final frame
- **THEN** the tail continues forward
- **AND** selected participants play their Outro
- **AND** final settle occurs only after both are complete

#### Scenario: Content completes in the middle of a loop pass

- **GIVEN** Loop middle and a content-driven Hold are active
- **WHEN** the selected content completes between Content start and Out point
- **THEN** the current Middle pass continues forward to Out point
- **AND** Outro continues from Out point without wrapping to Content start or jumping ahead

#### Scenario: Frozen Hold continues forward into Outro

- **GIVEN** the composition is frozen at Out point
- **WHEN** its timed or content-driven Hold completes
- **THEN** Outro advances forward from Out point
- **AND** no element rewinds to Content start or jumps through a media-specific Freeze frame

#### Scenario: Operator Stop remains immediate

- **GIVEN** an automatic content completion is waiting for the current Middle boundary
- **WHEN** the operator presses Stop
- **THEN** the pending drain is cancelled
- **AND** Outro begins immediately

### Requirement: Transport controls own both clocks

Pause/Resume SHALL freeze/resume both the Middle loop and unchecked local tails. Play/reset/remove
SHALL cancel stale clocks. Manual, timed and content-driven Hold SHALL share these rules.

#### Scenario: Pause and resume a mixed Hold

- **GIVEN** a checked participant is looping and an unchecked participant is advancing once
- **WHEN** playback is paused and later resumed
- **THEN** neither clock advances during the pause
- **AND** both continue from their previous positions after resume
