## ADDED Requirements

### Requirement: Canvas ordinary Play uses the Preview lifecycle

The Designer SHALL implement the following accepted authoring behavior without modifying stored scene timing or broadcast commands.

#### Scenario: Lifecycle content

- **WHEN** ordinary forward Play starts a ticker or Repeater
- **THEN** its actual content/entrance/exit driver runs and natural completion re-arms Play

#### Scenario: Pause and resume

- **WHEN** the author pauses then plays
- **THEN** the same runtime lifecycle resumes instead of restarting

#### Scenario: Authoring tools

- **WHEN** the author scrubs, reverses or enables Preview loop or ping-pong
- **THEN** only the authoring playhead moves and no content lifecycle restarts

#### Scenario: Empty composition

- **WHEN** a static or empty root is played
- **THEN** the visible cursor advances on authored time without changing runtime paint timing
