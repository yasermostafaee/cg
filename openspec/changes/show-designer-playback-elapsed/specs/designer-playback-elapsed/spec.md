## ADDED Requirements

### Requirement: Designer transport shows elapsed playback

Designer SHALL display elapsed playback time alongside the actual frame position.

#### Scenario: A ticker continues during Freeze

- **WHEN** Rehearse holds the frame at Outro start and the ticker continues playing
- **THEN** elapsed playback advances while the frame position remains at Outro start

#### Scenario: Ordinary playback and Pause

- **WHEN** the operator plays or resumes ordinary timeline playback
- **THEN** elapsed playback advances
- **AND** the reading retains its value while playback is paused

#### Scenario: Stop finishes a session

- **WHEN** the current playback session stops
- **THEN** the elapsed readout returns to zero once any outro has finished
