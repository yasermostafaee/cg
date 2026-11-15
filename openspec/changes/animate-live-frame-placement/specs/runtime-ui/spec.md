## ADDED Requirements

### Requirement: Operators can animate updates to live frame placement

CG Control SHALL offer Cut, Linear, Ease in, Ease out, Ease in/out, Bounce and Elastic for eligible on-air live
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

#### Scenario: A shared frame moves between live presets

- **GIVEN** the same authored plate and artwork use the same seated input in a one-frame and a two-frame preset
- **WHEN** the operator selects either preset on air with motion enabled
- **THEN** the common plate travels from the outgoing position and size to the incoming position and size
- **AND** it retains its input and existing audio policy
- **AND** the switch completes with only the incoming preset visible

#### Scenario: Animate a verified preset with a configured backup

- **GIVEN** a legacy mirror station with a verified active programme page and reusable live seats
- **WHEN** the operator switches presets with a motion or Fade effect
- **THEN** the active programme renders the effect and the reserve settles on the same preset through its verified mirror
- **AND** missing backup inputs remain empty while other eligible inputs and artwork are updated
- **AND** transient mixer batches cannot be committed to another engine after ownership changes

#### Scenario: Rehearse a preset selection

- **GIVEN** Preview is playing a live layout
- **WHEN** the operator changes its staged preset or input with an effect selected
- **THEN** PVW rehearses the change locally
- **AND** the applied PGM preset and inputs remain unchanged until an on-air action

#### Scenario: Apply a row preset after previewing other presets

- **GIVEN** the row has an independent Inspector preview cue
- **WHEN** its row preset command succeeds
- **THEN** Preview follows the applied preset without replaying the on-air effect, unless the operator chose a newer cue
- **AND** if the command is refused, Preview keeps the existing cue and Programme keeps its applied state

#### Scenario: Rehearse a drafted frame move

- **GIVEN** Preview is playing a plate with a frame placement draft
- **WHEN** the operator runs Preview frame effect
- **THEN** the plate rehearses the selected effect from the applied placement to the draft
- **AND** direct dragging and resizing keep their immediate feedback

#### Scenario: A shared frame crosses a departing masked group

- **GIVEN** a verified outgoing artwork group contains only departing plates and the resident pages support hiding it
- **WHEN** motion would cross that group in reversed native paint order
- **THEN** its plates, mask fragments and nested artwork become hidden before the shared frame moves
- **AND** the shared frame moves with the selected effect and keeps playing its input
- **AND** the departing group's normal opacity and geometry remain available on return to the outgoing preset

#### Scenario: Plate counts change and a title has per-preset visibility

- **WHEN** a preset transition adds or removes a verified plate
- **THEN** its picture and mask enter or exit together
- **AND** the remaining frame stays above departing content during the movement
- **AND** linked titles remain hidden until settlement and then use the destination preset's authored visibility
- **AND** unrelated preset titles stay visible

#### Scenario: Fade a shared frame during a preset change

- **WHEN** Fade is enabled for an animated switch with a retained frame
- **THEN** the picture fades down and returns as its new placement settles
- **AND** separate PVW and PGM switches use the same channel-frame budget for each visible phase

#### Scenario: The engine connection drops during a preset change

- **WHEN** the same engine reconnects after an interrupted preset effect
- **THEN** its prior native arrangement and any surviving artwork passes are restored
- **AND** seats created only for the interrupted arrival are muted, hidden and cleared
- **AND** removed or replaced artwork remains under its current owner

#### Scenario: Change the input without moving its frame

- **WHEN** the operator changes an input with Input effect set to Cut or Fade
- **THEN** the change uses the selected effect inside the same frame
- **AND** an eligible source parked for another preset can be reused and any still-needed outgoing source remains parked
- **AND** a single stable rectangular mask keeps its clip while its input dissolves
- **AND** a refused Fade preserves the previously applied source

#### Scenario: Reframe beside a masked plate

- **WHEN** a plate owns an authored mask
- **THEN** operator Crop is unavailable for that plate in Preview and Programme
- **AND** an eligible unmasked plate keeps its own Crop control
