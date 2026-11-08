## ADDED Requirements

### Requirement: Timeline rows SHALL expose authored Rule and Step participation

The Timeline SHALL show a distinct Rule badge on an element that owns one or more Value Rules. It
SHALL show a distinct Step badge on a countdown that owns Countdown Steps and on every element
explicitly targeted by a change in that countdown's Before or timed Steps. These badges SHALL have
accessible labels and SHALL be absent when the respective relation does not exist.

#### Scenario: One layer owns rules and is changed by a step

- **GIVEN** a shape owns a Value Rule and a countdown Step explicitly changes that shape
- **THEN** the shape row shows both Rule and Step badges
- **AND** the countdown row shows the Step badge but no Rule badge

#### Scenario: Unrelated layer stays unmarked

- **GIVEN** a layer owns no Value Rules and no Countdown Step targets it
- **THEN** its row shows neither automation badge
