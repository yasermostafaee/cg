## ADDED Requirements

### Requirement: Play indication agrees with confirmed ownership after Take

After a Take, the console SHALL display the state that matches confirmed producer ownership. A warning or unrelated transient condition SHALL NOT overwrite confirmed on-air state. An uncertain or lost state SHALL be visibly distinguishable from a confirmed live producer and leave diagnostic evidence.

#### Scenario: A Take succeeds and its producer stays on air

- **WHEN** a Take is confirmed and the owned producer remains on air
- **THEN** the row keeps its on-air indication despite a transient warning that does not invalidate ownership

#### Scenario: Confirmation is lost

- **WHEN** confirmation is missing or the producer actually stops
- **THEN** show the corresponding unconfirmed or ended state and keep the reason available
