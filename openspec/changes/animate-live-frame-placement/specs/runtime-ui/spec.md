## ADDED Requirements

### Requirement: Operators can animate updates to live frame placement

CG Control SHALL offer Cut, Linear, Ease in, Ease out and Ease in/out for eligible on-air live
frame placement updates. Fade SHALL be independently selectable. The default SHALL be Cut with
Fade disabled. The effect duration SHALL be configurable from 100 to 1000 ms.

#### Scenario: Draft a move or resize

- **WHEN** an operator moves or resizes an eligible live frame in PVW
- **THEN** PVW immediately shows the draft
- **AND** PGM runs the selected effect only after Update on air
- **AND** off-air Update continues to store the placement for the next Take

#### Scenario: Combine Fade and motion

- **WHEN** motion is Cut and Fade is enabled
- **THEN** the affected frame fades out, changes placement and fades in
- **WHEN** Linear or Ease is enabled with Fade
- **THEN** the affected frame moves while its opacity falls and returns

#### Scenario: Retain the input and associated artwork

- **WHEN** the effect runs on a verified resident layout
- **THEN** the input and its audio continue while its frame, mask and attached artwork follow the placement
- **AND** safety actions can interrupt the effect
- **AND** a refused phase restores the applied placement and opacity when the same output is still owned

#### Scenario: Use an earlier exported page

- **WHEN** the resident page supports frame placement without effects
- **THEN** CG Control keeps its existing immediate placement workflow
