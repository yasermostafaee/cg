## ADDED Requirements

### Requirement: Composition has an IN / HOLD / OUT lifecycle

A composition SHALL optionally define lifecycle phase markers `introEndFrame` and
`outroStartFrame` located inside its active region, satisfying
`activeRange.in ≤ introEndFrame ≤ outroStartFrame ≤ activeRange.out`. The intro is
`[activeRange.in, introEndFrame]`, the hold is the held `introEndFrame`, and the
outro is `[outroStartFrame, activeRange.out]`. A composition with no lifecycle
markers SHALL behave exactly as today (no distinct phases).

#### Scenario: Author marks intro-end and outro-start

- **WHEN** the author drags the intro-end and outro-start markers on the timeline
- **THEN** the composition stores them with
  `activeRange.in ≤ introEndFrame ≤ outroStartFrame ≤ activeRange.out`, and the
  IN / HOLD / OUT phases are derived from them

### Requirement: Play holds after intro; stop plays the outro

When a composition defines lifecycle phases, `play()` SHALL play the intro once
and then hold at the hold frame — it SHALL NOT loop the whole range and SHALL NOT
auto-play the outro. `stop()` SHALL play the outro from the outro-start to the
active-region end and then settle to hidden.

#### Scenario: Play runs the intro and holds

- **WHEN** `play()` is called on a composition with lifecycle phases
- **THEN** the intro plays once and the composition holds at the hold frame
  without looping and without playing the outro

#### Scenario: Stop runs the outro

- **WHEN** `stop()` is called while the composition is holding
- **THEN** the outro plays from the outro-start to the active-region end

### Requirement: Pause and resume

The runtime SHALL expose `pause()` and `resume()`. `pause()` SHALL freeze playback
at the current frame; `resume()` SHALL continue from that frame. These SHALL work
during the intro, the hold, or the outro.

#### Scenario: Pause freezes the current frame

- **WHEN** `pause()` is called during playback
- **THEN** the current frame is held until `resume()` is called, which continues
  from that exact frame

### Requirement: No-code playout timing modes

A composition SHALL carry a playout config with a `mode` of `manual`, `auto-out`,
`loop-cycle`, or `content-driven`, plus `holdMs` and `repeat` where applicable,
all authored without code. `manual` SHALL hold after the intro until `stop()`.
`auto-out` SHALL, after the intro and `holdMs`, play the outro automatically.
`loop-cycle` SHALL repeat intro → hold(`holdMs`) → outro for `repeat` cycles (or
forever when `repeat` is `infinite`), or until `stop()`. The composition SHALL
self-run these from its config, requiring only on/off from the operator.

#### Scenario: Auto-out plays the outro after the hold

- **WHEN** the mode is `auto-out` with `holdMs = T` and `play()` is called
- **THEN** the intro plays, the composition holds for T, and then the outro plays
  automatically

#### Scenario: Loop-cycle repeats the full cycle

- **WHEN** the mode is `loop-cycle` with `holdMs = T` and `repeat = N`
- **THEN** the composition repeats intro → hold(T) → outro N times and then stops,
  and when `repeat` is `infinite` it repeats until `stop()` is called

### Requirement: Lifecycle and timing are exported and preview-faithful

The exported template metadata SHALL carry `introEndFrame`, `outroStartFrame`,
`mode`, `holdMs`, `repeat`, and the outro duration in milliseconds
(`(activeRange.out − outroStartFrame) / frameRate × 1000`). The preview SHALL run
the same runtime source as the export, so play, hold, pause, auto-out, and
loop-cycle behave identically in preview and on air.

#### Scenario: Export carries lifecycle and timing metadata

- **WHEN** a composition with phase markers and a timing config is exported
- **THEN** the template metadata includes the intro/outro frames, the mode,
  `holdMs`, `repeat`, and the outro duration in milliseconds

#### Scenario: Preview matches the exported file

- **WHEN** the composition is previewed and then exported
- **THEN** play, hold, pause, auto-out, and loop-cycle behave identically in both
