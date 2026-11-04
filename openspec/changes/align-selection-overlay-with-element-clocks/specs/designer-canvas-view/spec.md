## ADDED Requirements

### Requirement: Canvas selection geometry follows each element's visual clock

During lifecycle playback, the Designer Canvas SHALL draw and interact with an element's selection
geometry at the frame actually used to paint that element. The root composition cursor SHALL remain
the composition lifecycle cursor and SHALL NOT be repurposed as a selected-element clock.

#### Scenario: An unchecked element advances while the Middle wraps

- **GIVEN** Loop middle and an animated element excluded from Repeat during Hold
- **WHEN** the root cursor wraps and the element advances once on its independent tail
- **THEN** the element's selection box, hit-test and transform gestures remain aligned with its
  painted geometry

#### Scenario: Checked participants follow the root loop

- **WHEN** a selected element participates in Repeat during Hold
- **THEN** its painted picture and selection geometry wrap together at the Middle boundary

#### Scenario: Manual scrub owns authoring geometry

- **WHEN** lifecycle playback is not active and the author scrubs the timeline
- **THEN** selection geometry uses the authoring playhead and no stale lifecycle frame survives
