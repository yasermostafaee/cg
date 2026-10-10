# designer-playout-lifecycle

## ADDED Requirements

### Requirement: A settled loop SHALL remember a pass timing for its next run and re-arm nothing

A `loop-cycle` controller that has settled (its run ended by itself, or it was stopped) SHALL keep a pass count or
a between-pass gap it is told, and its next `play()` SHALL run with them. The count is a TOTAL for that run, as
before any first run.

Being told SHALL NOT bring the graphic back: no pass starts, no frame is painted and no exit or settle is
announced until the next `play()`. A controller that is not `loop-cycle` SHALL still ignore both.

#### Scenario: Until stop told after a counted run loops on the next play

- **WHEN** a loop was told a count of one on air, ran it and settled, and is then told `passes: 'infinite'` and
  played again
- **THEN** it loops until stopped

#### Scenario: Being told does not re-arm a settled graphic

- **WHEN** a settled loop is told a count
- **THEN** no frame is painted and no event fires until it is played again

#### Scenario: A gap told while settled is the next run's gap

- **WHEN** a stopped loop is told a between-pass gap and played again
- **THEN** the graphic stays off screen for that gap between its passes

#### Scenario: Without a new timing, the next run keeps the last count it was told

- **WHEN** a loop that was told a count of one on air is played again with no timing told since
- **THEN** it runs one pass and ends
