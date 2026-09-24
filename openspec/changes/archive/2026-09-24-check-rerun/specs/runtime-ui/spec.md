## ADDED Requirements

### Requirement: A connection check that runs again starts clean

The console SHALL clear every line of the connection check the moment a check starts, showing each
line's subject in a neutral checking state and no verdict until that check's own reply arrives
(`CHECK-RERUN-01`). Every check SHALL be tagged, and only the latest SHALL write the lines, the busy
state or the post-sign-in judging: a reply from an earlier check SHALL never change them. While a
check runs, CHECK SHALL stay disabled and the address read-only. A line not checked (`skip`) and a
line checking SHALL wear the quiet inks, never the error ink, and the surface SHALL carry no
explanatory prose.

#### Scenario: A re-check

- **WHEN** a check has finished and CHECK is pressed again **THEN** every line shows its subject,
  checking, and no pass or fail mark until the new reply arrives **AND** the new reply then fills
  the lines in
- **WHEN** the bridge does not answer the re-check **THEN** no line is left checking and none of
  the last run's lines is shown

#### Scenario: A stale reply

- **WHEN** a slow reply from a first check arrives after a second check started **THEN** the lines
  stay the second check's **AND** the second check's own reply does change them
- **WHEN** the first check's reply arrives after the second's **THEN** the second's lines stay

#### Scenario: Neutral is not red

- **WHEN** a line is not checked or checking **THEN** it is drawn in a quiet ink with its own mark
  **AND** a failed line is still drawn in the error ink
