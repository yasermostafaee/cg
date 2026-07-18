# designer-lottie-element (D-125 delta)

## ADDED Requirements

### Requirement: Import validates through the allowlist and places a Lottie element

A bodymovin `.json` (or `.lottie`) import SHALL validate through `@cg/lottie-bridge`'s import
allowlist — 3D layers, expressions, effects, and audio SHALL be rejected with a human-readable reason
and the animation SHALL NOT be imported. A valid import SHALL land as a `lottie` asset in the project
assets, and the operator SHALL be able to create and place a `lottie` element referencing it on the
canvas, positioned like any other element.

#### Scenario: A valid bodymovin JSON imports and places

- **WHEN** the operator imports a bodymovin `.json` that uses only supported layer types
- **THEN** it validates through the allowlist, lands as a `lottie` asset, and a `lottie` element can
  be created and placed on the canvas

#### Scenario: An unsupported feature is rejected with a reason

- **WHEN** the operator imports a Lottie JSON containing a 3D layer, an expression, an effect, or an
  audio layer
- **THEN** the import is rejected with a readable reason naming the offending feature, and no `lottie`
  element is created

### Requirement: A Lottie element is opaque, positionable, and timed

A `lottie` element SHALL be positioned, scaled, rotated, opacity-animated, and timed on the timeline
exactly like any other element. The Inspector SHALL expose the element's speed, hold behaviour, and
phase mapping, but SHALL NOT expose the animation's internal keyframes — the animation is opaque and
no internal keyframe is ever converted to a native one.

#### Scenario: The element is transformable and timed like any element

- **WHEN** a `lottie` element is selected
- **THEN** it can be positioned / scaled / rotated / opacity-animated and given a timeline lifespan,
  and the Inspector shows speed, hold behaviour, and the phase mapping

#### Scenario: The animation internals stay opaque

- **WHEN** the operator inspects a `lottie` element
- **THEN** the Inspector offers no editor for the animation's internal keyframes, layers, or paths

### Requirement: Phases come from bodymovin markers, else manual marking

The element's phase mapping SHALL be read from a valid bodymovin `markers` set when present — the
intro-end and outro-start frames (plus an optional idle segment), in the animation's own frame space —
and SHALL otherwise fall back to manual marking, where the operator sets those frames by hand in the
Inspector against the animation's own frame space. A valid marker set SHALL satisfy
`ip ≤ introEnd ≤ outroStart ≤ op`; an incomplete or out-of-range set SHALL be treated as no markers.

#### Scenario: Markers drive the phase mapping

- **WHEN** the imported JSON carries recognised `intro-end` / `outro-start` markers (and optionally an
  idle pair) with in-range, ordered frames
- **THEN** the element's phase mapping is read from them and marked as marker-sourced

#### Scenario: No usable markers falls back to manual marking

- **WHEN** the imported JSON has no markers, or a marker set that is incomplete or out of range
- **THEN** the operator marks intro-end / outro-start (and optionally the idle segment) by hand in the
  Inspector, clamped to `ip ≤ introEnd ≤ outroStart ≤ op`

### Requirement: On play the intro runs once and the element holds

WHEN the composition plays, the Lottie SHALL play its intro `[ip → introEnd]` **once** and then HOLD —
freezing at the hold frame by default, or looping the mapped idle segment when hold behaviour is
opt-in `idle-loop` — instead of looping the whole animation. An element with no phase mapping SHALL
play the whole clip once and freeze at its last frame.

#### Scenario: Freeze hold (default)

- **WHEN** a `lottie` element with `holdBehavior: 'freeze'` plays
- **THEN** its intro plays once and it holds frozen at the hold frame, not looping the animation

#### Scenario: Idle-loop hold (opt-in)

- **WHEN** a `lottie` element with `holdBehavior: 'idle-loop'` and a resolvable idle segment plays
- **THEN** its intro plays once and it then loops the idle segment, freezing with the scene on pause

### Requirement: A native ticker on top drives the hold; the Lottie does not by default

A native ticker or sequence placed ON TOP of the Lottie in a `content-driven` composition SHALL drive
the content-driven hold (the existing D-107/D-112 model), and the Lottie SHALL hold beneath it. The
Lottie SHALL NOT drive the content-driven hold by default; it SHALL be opt-in via a `drivesHold` flag
(the inverse default of the ticker/clock/sequence, whose absent flag participates). A freeze Lottie
that opts in SHALL gate the hold until its intro completes; an idle-loop Lottie that opts in SHALL
hold until `stop()`.

#### Scenario: The ticker drives the hold and the Lottie holds beneath

- **WHEN** a content-driven composition has a native ticker over a `lottie` element with `drivesHold`
  absent/false
- **THEN** the ticker drives the hold and the Lottie holds beneath it without gating the hold

#### Scenario: The Lottie can opt in to drive the hold

- **WHEN** a `lottie` element sets `drivesHold: true` and freezes
- **THEN** its intro completion gates the content-driven hold (a self-contained sting), and its outro
  plays when the composition is taken off air by `out()` or `stop()`

#### Scenario: A composition that ends its own hold exits without the element outro

- **WHEN** a composition ends its OWN content-driven hold (an `auto-out` exit driven by the playout
  controller rather than an `out()` / `stop()` command)
- **THEN** the background outro plays and the composition settles CLEARED with the Lottie parked on
  its hold frame — the element outro is played only on the `out()` / `stop()` exit paths

### Requirement: Stop and Out play the Lottie outro before the background, settling CLEARED

WHEN the composition is stopped (`stop()`) or exited (`out()`), the Lottie SHALL play its OUTRO
segment `[outroStart → op]`; the background outro SHALL NOT close over it — the background outro plays
only AFTER every element outro has finished — and the composition SHALL settle to CLEARED with every
driver halted, consistent with D-085 and D-105's content-first / background-last order.

#### Scenario: Out plays the Lottie outro then the background

- **WHEN** `out()` is called while a `lottie` element is holding
- **THEN** the Lottie plays its outro segment, the background outro plays only after it finishes, and
  the composition settles CLEARED with the Lottie halted

#### Scenario: Stop also plays the Lottie outro

- **WHEN** `stop()` is called while a `lottie` element is holding
- **THEN** the Lottie plays its outro segment before the background outro, and the composition settles
  CLEARED with every driver halted

#### Scenario: A degenerate or absent outro settles without a strand

- **WHEN** a `lottie` element has no outro segment (absent phases or `outroStart ≥ op`) and `out()` or
  `stop()` is called
- **THEN** the element outro resolves immediately, the background outro plays, and the composition
  settles CLEARED — never hanging on an unresolved outro

### Requirement: A hidden Lottie is fully inert in the lifecycle

A `lottie` element with `visible: false` SHALL be fully inert in the composition lifecycle, and so
SHALL a visible Lottie that sits inside a hidden ancestor (a hidden composition instance's subtree) —
extending B-034's established hidden/visible gate to the element-outro and hold-aggregation paths. A
hidden Lottie SHALL NOT have its outro awaited on `out()` / `stop()` (it must never stall the exit for
something nobody can see) and SHALL NOT contribute to the content-driven hold even when it sets
`drivesHold: true` — the hidden gate wins over the opt-in.

#### Scenario: A hidden Lottie is not awaited on exit

- **WHEN** a `lottie` element with `visible: false` owns an outro segment and `out()` or `stop()` is
  called
- **THEN** its outro is neither played nor awaited, and the composition settles CLEARED without
  stalling for the hidden element's outro duration

#### Scenario: A Lottie under a hidden ancestor is inert

- **WHEN** a VISIBLE `lottie` element sits inside a hidden composition instance's subtree
- **THEN** it is inert: its outro is not awaited on `out()` / `stop()`, and it contributes nothing to
  the content-driven hold even with `drivesHold: true`

### Requirement: Pause and resume freeze and continue the Lottie in lockstep

WHEN the scene is paused and resumed, Lottie playback SHALL freeze and continue in lockstep with the
rest of the scene, with no drift against the `FrameDriver` playhead — the Lottie is driven frame by
frame off the same injected runtime clock, not by an autonomous player.

#### Scenario: Pause freezes the Lottie with the scene

- **WHEN** `pause()` is called during the intro, the hold's idle loop, or the outro
- **THEN** the Lottie freezes at its current frame and `resume()` continues it from that exact frame,
  in step with the frozen hold timers

### Requirement: Lottie field overrides resolve through the existing bindings model

WHEN a Lottie field override (text / colour; image if cheap) is bound, it SHALL resolve through the
EXISTING fields/bindings model and the `lottie-override` binding target SHALL stop being a no-op. This
is a secondary path — the native overlay, not the Lottie, carries the dynamic content.

#### Scenario: A bound text/colour override reaches the animation

- **WHEN** a `text` or `color` field is bound to a `lottie-override` target naming a layer and property
- **THEN** the value resolves through the bindings model and updates that layer's text/colour in the
  rendered Lottie, on play and on every `update()`

### Requirement: Preview, .vcg, and single-file HTML render identically and run offline under CEF

The Designer preview, the `.vcg` export, and the single-file HTML export SHALL render the Lottie
identically. The single-file HTML SHALL run under CasparCG's CEF from `file://` with the player JS
bundled/inlined and the Lottie JSON inlined as a JS literal, and SHALL issue ZERO external requests.
The `.vcg` SHALL pack the Lottie JSON as asset bytes.

#### Scenario: All three outputs render the same Lottie

- **WHEN** a template containing a `lottie` element is previewed, exported to `.vcg`, and exported to
  single-file HTML
- **THEN** the Lottie renders identically in all three, with the intro / hold / outro lifecycle intact

#### Scenario: The single-file HTML is self-contained under CEF

- **WHEN** the single-file HTML export is loaded under CasparCG's CEF from `file://`
- **THEN** the player JS and the Lottie JSON are inlined, the file issues zero external requests, and
  the graphic boots and plays its lifecycle

### Requirement: The Lottie's intro derives the composition's entrance settle

A VISIBLE Lottie element whose phases are authored SHALL contribute its INTRO completion to the
composition's entrance-settle derivation — the same derivation that reads a designer's own keyframe
tracks — so that native content (ticker / clock / sequence) starts when the Lottie furniture has
visually settled, with NO manual trim on the content element.

The contribution is computed by converting the intro from the ANIMATION's frame space into the
composition's: `seconds = (introEnd − ip) / (fr × speed)`, then
`compositionFrames = round(seconds × compositionFrameRate)`. The animation itself SHALL NOT be
rescaled or resampled — it plays untouched at its authored speed; only the DERIVED settle moves.

#### Scenario: Content starts at the Lottie's intro completion, not at play

- **WHEN** a composition contains a visible Lottie with an authored intro (intro-end 20 at 30 fps,
  speed 1) and a ticker, at a composition frame rate of 50 fps and an out-point beyond frame 33
- **THEN** the entrance settle is composition frame 33 and the ticker begins there — not at play, and
  without any trim applied to the ticker

#### Scenario: The derived settle tracks the authored speed

- **WHEN** the same Lottie's `speed` is 2
- **THEN** the intro occupies half the wall-clock time and the derived settle halves accordingly

#### Scenario: Multiple Lotties settle on the latest

- **WHEN** a composition contains more than one visible Lottie with authored intros of different
  durations
- **THEN** the entrance settle is the LATEST of their derived frames — the scope has settled only once
  every Lottie has

#### Scenario: Mixed with keyframed elements, the settle is the later of the two

- **WHEN** a composition contains BOTH keyframed elements and a visible Lottie
- **THEN** the entrance settle is the later of the keyframe-derived settle and the Lottie-derived
  settle, so a still-moving background is not treated as settled because the furniture is

#### Scenario: A manual content-start marker still overrides the derived value

- **WHEN** a content-start marker is placed on a composition that also derives a settle from a Lottie
- **THEN** the marker frame governs the content start, exactly as it overrides the keyframe heuristic

#### Scenario: A hidden Lottie contributes nothing to the settle

- **WHEN** a Lottie has `visible: false`, or sits inside a hidden ancestor's subtree
- **THEN** it contributes NOTHING to the entrance-settle derivation — the hidden-inert gate extends
  here, so content is never delayed for furniture nobody can see

#### Scenario: A marker-less clip contributes nothing

- **WHEN** a Lottie carries no authored `phases` block
- **THEN** it contributes nothing to the entrance settle: the "whole clip is the intro" fallback is
  the ABSENCE of phase information, not an authored claim, so a long unmarked clip does not push the
  settle out

#### Scenario: A derived settle past the out-point is clamped and surfaced

- **WHEN** a Lottie's derived settle would land beyond the composition's out-point (its intro needs
  33 composition frames but the out-point is at 30)
- **THEN** the settle is CLAMPED to the out-point — never beyond it — and the Inspector surfaces a
  warning naming both numbers, so the overrun is never silently swallowed

### Requirement: The Lottie Inspector shows the clip's timing in both frame spaces

The Lottie Inspector SHALL show the timing an operator needs to author against, without hand
conversion: the clip's total frames, its native frame rate, and its duration in seconds; and each
phase (intro / hold / outro) in ANIMATION frames, in seconds, AND in THIS composition's frames. The
readout SHALL live-update when the element's `speed` or phase values change, or when the composition's
frame rate changes, and SHALL be computed from the SAME helper the runtime derives the settle from, so
the number shown is the number used.

#### Scenario: The phase breakdown is shown in both frame spaces

- **WHEN** a Lottie with an intro of animation frames 0–20 at 30 fps is selected in a 50 fps
  composition
- **THEN** the Inspector shows the clip totals and the intro as `0–20`, its duration in seconds, and
  the composition frame it lands on

#### Scenario: The readout live-updates when speed changes

- **WHEN** the operator changes the element's `speed`
- **THEN** the seconds and composition-frame figures update immediately to match

#### Scenario: The out-point overrun warning names both numbers

- **WHEN** the derived settle exceeds the composition's out-point
- **THEN** the Inspector shows a warning naming the frames the intro needs AND the out-point frame,
  and advising that the out-point be extended or the intro will be cut
