## ADDED Requirements

### Requirement: Sound placement compares duration to the active composition

Designer SHALL compare a newly placed entrance sound's duration to the composition's active range. Library import SHALL store the sound before any placement decision. Each sound row SHALL display the sound's duration in seconds on the Timeline.

#### Scenario: A sound fits the composition

- **WHEN** the author imports a sound into Project Assets
- **THEN** the asset is stored without a duration prompt
- **WHEN** the author places the sound and its duration fits in the active composition
- **THEN** Designer inserts and selects the sound immediately
- **AND** its Timeline row displays the sound's duration

#### Scenario: A sound exceeds the composition

- **WHEN** the author places a sound longer than the active composition
- **THEN** Designer offers **Extend the composition** and **Cancel**
- **WHEN** the author extends
- **THEN** the active range grows to the first whole frame that fits the sound, and Designer inserts and selects the sound
- **AND** one undo restores the previous active range and removes the placed sound
- **WHEN** the author cancels
- **THEN** Designer discards the placement request and keeps the sound available in Project Assets

#### Scenario: The author changes the document while the prompt is open

- **WHEN** the author switches projects or compositions before confirming the duration prompt
- **THEN** Designer dismisses the prompt and discards the placement request
- **WHEN** the current composition's frame rate or active range changes while the prompt is open
- **THEN** Extend uses the current frame rate and increases the active range only if the sound still exceeds it
