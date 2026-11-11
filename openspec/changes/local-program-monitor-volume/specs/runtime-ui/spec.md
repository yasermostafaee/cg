## ADDED Requirements

### Requirement: Programme monitor volume is adjustable on the local console

The PGM strip SHALL offer a volume control for the local speaker. The console SHALL store its
selected level and default to full volume for existing or new installations with no saved level.

#### Scenario: Change listening level while the monitor is playing

- **WHEN** an operator changes monitor volume while programme sound is playing
- **THEN** the speaker level changes without reconnecting the programme audio reader
- **AND** the programme output and its meter reading remain at the engine's level
- **AND** reloading the console restores the saved monitor volume
