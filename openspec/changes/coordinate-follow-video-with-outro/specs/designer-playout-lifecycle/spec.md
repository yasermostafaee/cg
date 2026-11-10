## ADDED Requirements

### Requirement: Follow-video exit observes the authored composition Outro

A composition-following video and the composition's directly authored graphics SHALL honor their authored Outro timing without serially playing the whole video tail before starting plain text keyframes. The author SHALL be able to place a text fade before the video starts its closing segment. Independently timed media SHALL preserve its own authored policy.

#### Scenario: Plain text fades during the authored exit

- **WHEN** Stop starts an Outro with a Follow video and plain text opacity keyframes
- **THEN** the text begins fading at its authored frame rather than waiting for the video's tail to finish

#### Scenario: Text closes before the background

- **WHEN** the author schedules the text fade ahead of the video closing segment
- **THEN** the text finishes fading before that segment begins and the composition settles after both are finished
