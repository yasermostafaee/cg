## ADDED Requirements

### Requirement: Verified peer receives resident frame geometry phases

For a current paired page with preset transition capability and a resolved look, animated resident frame placement SHALL use the existing verified peer phase transaction. Native transforms and artwork SHALL carry the effect phases to an independently confirmed resident peer. An unproven reserve producer SHALL remain untouched.

#### Scenario: Animated move on a verified pair

- **WHEN** an operator applies an animated frame move or resize
- **THEN** the verified reserve receives deferred native easing and artwork phases before the active effect completes
- **AND** the final transforms match on both physical channels

#### Scenario: Same-kind producer without successful seating

- **GIVEN** a reserve producer of the same kind whose seating command was refused
- **WHEN** an operator moves the active frame
- **THEN** no geometry is applied to that unrelated reserve producer

#### Scenario: Active phase refusal

- **WHEN** an active artwork phase is refused after geometry staging
- **THEN** the existing transaction restores the preceding geometry and drains reserve staging
- **AND** a subsequent valid geometry effect can complete

#### Scenario: Older page

- **GIVEN** a page without the required preset transition capability
- **WHEN** a geometry effect is requested
- **THEN** its existing active effect and settled reserve behavior remain available
