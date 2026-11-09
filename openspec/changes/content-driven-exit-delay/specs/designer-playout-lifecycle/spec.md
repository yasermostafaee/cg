## ADDED Requirements

### Requirement: An authored delay can extend the graphic's Content-driven hold

The Playback Inspector SHALL expose a saved **Exit delay** in milliseconds for Auto-out and Loop
cycle compositions with an effective Content-driven hold. Designer Rehearse and exported
graphics SHALL use the same authored value. Missing and zero values SHALL retain the ordinary
automatic exit after completion. The delay SHALL keep the graphic on screen and SHALL run
separately from the off-screen gap between passes.

#### Scenario: An Azan announcement remains visible for one minute

- **GIVEN** an Auto-out composition has a countdown hold driver, a zero announcement and an
  Exit delay of 60000 ms
- **WHEN** the countdown and any other enabled drivers finish
- **THEN** the graphic stays in Hold for 60000 ms and then plays its authored Outro

#### Scenario: Pausing or stopping during the delay

- **WHEN** Rehearse pauses during the exit delay
- **THEN** the unelapsed duration is preserved until Resume
- **AND** Stop starts the ordinary operator exit immediately and cancels the pending delay

#### Scenario: Each pass waits independently

- **GIVEN** a Content-driven Loop cycle graphic has an Exit delay and a gap between passes
- **WHEN** the active content finishes in a pass
- **THEN** the graphic waits the Exit delay before its Outro
- **AND** the next pass begins after the separate gap and waits on its own content

#### Scenario: No effective content driver

- **WHEN** the last hold driver is disabled
- **THEN** the Inspector shows the Timed fallback and the saved Exit delay is inactive
