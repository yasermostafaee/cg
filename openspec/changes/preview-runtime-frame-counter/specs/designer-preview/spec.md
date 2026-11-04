## ADDED Requirements

### Requirement: Preview observes the real root lifecycle frame

The Designer SHALL implement the following accepted authoring behavior without modifying stored scene timing or broadcast commands.

#### Scenario: Animated lifecycle

- **WHEN** the runtime advances, holds, loops or exits
- **THEN** Preview reflects the root frame and does not substitute nested frames

#### Scenario: No paint changes

- **WHEN** the runtime collapses a visually static leg
- **THEN** observation adds no delay to output while a wholly static root uses an authored display clock

#### Scenario: Completion

- **WHEN** runtime stop.end occurs
- **THEN** the host elapsed clock settles; explicit Stop resets both counters
