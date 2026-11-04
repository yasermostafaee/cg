# designer-playout-lifecycle — delta (D-175)

## ADDED Requirements

### Requirement: Ordinary canvas Play uses the same runtime lifecycle as Preview

The Designer main canvas SHALL use the template runtime's real lifecycle for ordinary forward
Play. With the authoring-only Preview loop and ping-pong controls off, canvas Play SHALL call
`play()` (or `resume()` after a canvas pause), Pause SHALL call `pause()`, and the runtime SHALL own
intro, hold, content completion, outro and loop-cycle timing exactly as it does in the dedicated
Preview. Root runtime frames SHALL update the Designer playhead without being sent back as scrub
ticks. A natural lifecycle completion SHALL settle the canvas transport and a later Play SHALL
start a fresh run.

Reverse playback, Preview loop and ping-pong SHALL remain explicit playhead-only authoring tools;
they SHALL NOT change stored playout timing and SHALL NOT start or reset content drivers.

#### Scenario: A finite ticker closes the canvas graphic at the same boundary as Preview

- **WHEN** an auto-out composition uses a finite ticker as its content-driven hold source and the
  operator presses ordinary Play under the canvas
- **THEN** the canvas runs the intro, starts the ticker at hold entry, waits for its completion,
  runs the outro and settles without an extra Stop command, matching Preview

#### Scenario: Pause and Play resume the canvas lifecycle

- **WHEN** the operator pauses the canvas during intro, hold or outro and presses Play again
- **THEN** the runtime resumes from the paused lifecycle state instead of starting another run

#### Scenario: Repeater entrances and exits are visible on the canvas

- **WHEN** ordinary forward Play runs a composition with authored Repeater row effects
- **THEN** its real ordered entrance and exit drivers render the same row poses as Preview
- **AND** Pause/Resume and a fresh replay preserve their normal lifecycle semantics

#### Scenario: Natural completion re-arms Play

- **WHEN** a finite canvas lifecycle completes and the operator presses Play again
- **THEN** a fresh lifecycle starts from the entrance and every content driver is re-armed

#### Scenario: Runtime frame reports do not scrub the active lifecycle

- **WHEN** the canvas runtime reports a root frame while it owns playback
- **THEN** the Designer playhead reflects that frame and no `runtime.tick(frame)` feedback call
  overrides the controller-owned lifecycle frame

#### Scenario: An empty or static root keeps an authored Canvas cursor

- **WHEN** ordinary Canvas Play runs a root with no frame-dependent paint and Runtime collapses the
  rendered leg to its boundaries
- **THEN** the visible timeline cursor advances through authored intermediate frames, Pause and
  Resume preserve its position, and a fresh Play resets it to the entrance without adding repaint,
  delay or scrub feedback to Runtime

#### Scenario: Empty Preview and Canvas share lifecycle semantics

- **WHEN** an empty/static composition is rehearsed in the Canvas and the dedicated Preview
- **THEN** both visible frame counters follow the same authored Intro, Freeze or Middle-loop,
  Hold and Outro boundaries
- **AND** an explicit Stop resets Preview immediately while an early collapsed natural stop waits
  only for the finite authored display projection

#### Scenario: Authoring loop and reverse remain playhead-only

- **WHEN** Preview loop, ping-pong or reverse playback is used
- **THEN** the authoring playhead moves through its explicit transport range without calling the
  composition lifecycle or restarting ticker / sequence / clock drivers
