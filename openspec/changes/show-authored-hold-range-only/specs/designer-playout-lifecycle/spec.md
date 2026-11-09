## MODIFIED Requirements

### Requirement: The loop range is authorable on ANY composition that has an out-point

Designer SHALL offer `Set hold start` for every composition with an authored
Outro start, including shapes-only compositions. The author can set Hold start
inside the active range at or before Outro start. The Inspector supplies the
authoring action while Hold start is automatic. An author sets Outro start
separately before adding a Hold start.

#### Scenario: A shapes-only scene can author a loop range

- **WHEN** the main scene has an Outro start and contains only shapes
- **THEN** the author can set a Hold start in the Playback Inspector

#### Scenario: A Lottie-held composition can pin its content start

- **WHEN** a composition's only hold driver is a Lottie with `drivesHold: true`
- **THEN** the author can set its Hold start through the same action

#### Scenario: Authoring a loop range does not create an out-point

- **WHEN** a composition has no Outro start
- **THEN** the author must first set Outro start before authoring a Hold range

### Requirement: The loop range renders on the timeline with full-height markers

The Timeline SHALL display full-height indicator lines for authored Hold start
and Outro start markers. The range fill SHALL span the two authored markers.
With automatic Hold start, the Timeline SHALL render only the authored Outro
boundary. Preview and playout SHALL use the effective Hold timing.
The UI SHALL name transport looping, Loop cycle and the authored Hold range distinctly.

#### Scenario: Markers span the timeline height

- **WHEN** the author sets Hold start in a composition with an Outro start
- **THEN** its green start and orange end indicator lines extend the full height of the timeline

#### Scenario: Clear removes the Hold guide

- **WHEN** the author clears Hold start
- **THEN** the Hold boundary and shaded range disappear
- **AND** the authored Outro boundary remains visible

#### Scenario: The three loops are distinguishable

- **WHEN** a composition has both a transport loop toggle available and a Hold range authored
- **THEN** the surface names them distinctly
