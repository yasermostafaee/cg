# designer-lottie-element Specification

## Purpose

TBD - created by archiving change lottie-lifecycle-element. Update Purpose after archive.

## Requirements

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
  plays when the composition exits — by `out()`, `stop()`, or its own auto-exit

#### Scenario: A composition that ends its own hold plays the element outro (Phase 3b-2)

- **WHEN** a composition ends its OWN hold (an `auto-out` timer expiry or a content-driven completion,
  driven by the playout controller rather than an `out()` / `stop()` command)
- **THEN** the Lottie plays its outro segment to completion, THEN the background outro plays, and the
  composition settles CLEARED — identical to the operator exits (until Phase 3b-2 this path bypassed
  the element-outro seam and the furniture snapped off from its hold frame)

### Requirement: Every exit path plays the Lottie outro before the background, settling CLEARED

The Lottie SHALL play its OUTRO segment `[outroStart → op]` on EVERY exit path — `stop()`, `out()`,
OR an exit the composition triggers itself (an `auto-out` hold expiry, a content-driven hold
completion, a zero-length hold, or a `loop-cycle` boundary); the background outro SHALL NOT close
over it — the background outro plays only AFTER every element outro has finished — and the
composition SHALL settle to CLEARED with every driver halted, consistent with D-085 and D-105's
content-first / background-last order.
The element outro SHALL be DRIVEN at most once per exit episode, regardless of how many triggers
reach the exit (an auto-exit followed by an operator `stop()`, or the runtime awaiting the outro
registry and then cascading `stop()` into each scope's controller): a second trigger in the same
episode SHALL await an in-flight outro — never re-drive it — and SHALL proceed synchronously when it
already finished. On a `loop-cycle`, EACH cycle's exit SHALL play the outro again, and the cycle
boundary SHALL re-arm the element (intro replays, completion re-mints — the B-033 re-arm) so cycle
N+1 behaves like a fresh run; a NON-final cycle boundary SHALL play only the cycling scope's OWN
element outros — a descendant scope is not exiting, so its furniture persists across the parent's
cycles — while a FINAL exit plays the full visible subtree's. An operator `stop()`/`out()` SHALL
finalize every cycle before awaiting in-flight outros, so a loop boundary caught mid-outro resolves
as the final exit instead of re-arming (no double-drive, no intro replay mid-exit). A nested
composition that auto-exits SHALL await its OWN scope subtree's element outros — not the root's, not
its siblings'.

#### Scenario: Out plays the Lottie outro then the background

- **WHEN** `out()` is called while a `lottie` element is holding
- **THEN** the Lottie plays its outro segment, the background outro plays only after it finishes, and
  the composition settles CLEARED with the Lottie halted

#### Scenario: Stop also plays the Lottie outro

- **WHEN** `stop()` is called while a `lottie` element is holding
- **THEN** the Lottie plays its outro segment before the background outro, and the composition settles
  CLEARED with every driver halted

#### Scenario: A degenerate or absent outro settles without a strand

- **WHEN** a `lottie` element has no outro segment (absent phases or `outroStart ≥ op`) and any exit
  path runs — `out()`, `stop()`, or an auto-exit
- **THEN** the element outro resolves immediately, the background outro plays, and the composition
  settles CLEARED — never hanging on an unresolved outro

#### Scenario: An auto-out hold expiry plays the element outro (Phase 3b-2)

- **WHEN** an `auto-out` composition's timed hold expires with a `lottie` element holding
- **THEN** the element outro plays to completion, THEN the background outro, and the composition
  settles CLEARED — the exit consumes the element outro's duration instead of snapping the furniture
  off

#### Scenario: The outro is driven exactly once per exit episode (Phase 3b-2)

- **WHEN** a `stop()` (or `out()`) arrives while an auto-exit's element outro is already in flight
- **THEN** the later trigger awaits the in-flight outro — the outro is never re-driven from
  `outroStart` — and the composition settles CLEARED with the outro having played exactly once

#### Scenario: A loop-cycle plays and re-arms the outro on every cycle (Phase 3b-2)

- **WHEN** a `loop-cycle` composition with a `lottie` element runs multiple cycles
- **THEN** every cycle's exit plays the element outro, and each cycle boundary re-arms the element —
  the intro replays and the completion signal re-mints (B-033) — so no cycle closes without its outro
  and no stale completion collapses a later hold

#### Scenario: A cycle boundary leaves nested furniture alone (Phase 3b-2)

- **WHEN** a `loop-cycle` composition contains a nested composition instance whose `lottie` element
  owns an outro
- **THEN** the parent's non-final cycle boundaries play only the parent scope's own element outros —
  the nested furniture persists, visible, across every cycle — and the FINAL exit plays the nested
  outro exactly once

#### Scenario: A stop during a loop boundary's outro finalizes the cycle (Phase 3b-2)

- **WHEN** `stop()` or `out()` arrives while a `loop-cycle` boundary's element outro is in flight
- **THEN** the cycle is finalized before the outros are awaited: the in-flight outro completes as the
  final exit — driven exactly once, no cycle restart, no intro replay — and the composition settles
  CLEARED

#### Scenario: A play() superseding an auto-exit outro re-arms cleanly (Phase 3b-2)

- **WHEN** `play()` arrives while an auto-exit's element outro is in flight
- **THEN** the new run owns the scene — the superseded exit can never fire a stale background outro —
  and the new run's own exit later plays the outro afresh

### Requirement: A hidden Lottie is fully inert in the lifecycle

A `lottie` element with `visible: false` SHALL be fully inert in the composition lifecycle, and so
SHALL a visible Lottie that sits inside a hidden ancestor (a hidden composition instance's subtree) —
extending B-034's established hidden/visible gate to the element-outro and hold-aggregation paths. A
hidden Lottie SHALL NOT have its outro awaited on ANY exit path — `out()`, `stop()`, or an auto-exit
(Phase 3b-2 extends the gate to the controller-triggered exits, including a scope whose OWN ancestor
is hidden) — it must never stall the exit for something nobody can see, and SHALL NOT contribute to
the content-driven hold even when it sets `drivesHold: true` — the hidden gate wins over the opt-in.

#### Scenario: A hidden Lottie is not awaited on exit

- **WHEN** a `lottie` element with `visible: false` owns an outro segment and `out()` or `stop()` is
  called
- **THEN** its outro is neither played nor awaited, and the composition settles CLEARED without
  stalling for the hidden element's outro duration

#### Scenario: A Lottie under a hidden ancestor is inert

- **WHEN** a VISIBLE `lottie` element sits inside a hidden composition instance's subtree
- **THEN** it is inert: its outro is not awaited on any exit path, and it contributes nothing to
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

The `lottie-override` binding target SHALL resolve through the EXISTING fields/bindings model — no
longer a no-op (Phase 3c). The override surface is text and colour on NAMED top-level layers:
`prop: 'text'` replaces a text layer's document text; `prop: 'fill' | 'stroke'` recolours a layer's
STATIC authored fill/stroke. Image substitution is deferred (the design allows it only "if cheap",
and it is not). An override SHALL apply on play and on every `update()`, live and in place (D-106) —
it SHALL NOT touch the driver's playhead, retarget an in-flight lifecycle leg, or alter the
Phase-3a-derived entrance settle (no phase-affecting property is overridable: not `phases`, not
`speed`, not `holdBehavior`, not the asset). The STORED template SHALL be byte-unchanged — an
override is a runtime value, not a template edit. The opacity principle holds: an override
substitutes a static authored value; it SHALL NOT convert, re-time, or edit internal keyframes, and
an ANIMATED property remains owned by the clip's own keyframes. This is a secondary path — the
native overlay, not the Lottie, carries the dynamic content.

#### Scenario: A bound text/colour override reaches the animation

- **WHEN** a `text` or `color` field is bound to a `lottie-override` target naming a layer and property
- **THEN** the value resolves through the bindings model and updates that layer's text/colour in the
  rendered Lottie, on play and on every `update()`

#### Scenario: The stored template is unchanged (Phase 3c)

- **WHEN** overrides are applied through play and repeated `update()` calls
- **THEN** the stored scene document is byte-identical to before — the override lives only in the
  mounted animation

#### Scenario: A mid-lifecycle override never disturbs the lifecycle (Phase 3c)

- **WHEN** an override value arrives during the intro, the hold, or mid-outro
- **THEN** it applies in place without touching the playhead — the leg in flight continues, the exit
  settles normally, and the entrance settle derivation is unaffected

#### Scenario: Overrides degrade gracefully (Phase 3c)

- **WHEN** the target layer is missing/mistyped, the player is unmounted (unresolved asset) or
  destroyed, or the prop is outside the override surface
- **THEN** the override is a silent no-op — never a throw, never a strand — and a later `update()`
  re-applies once the target exists

#### Scenario: A hidden Lottie stays lifecycle-inert under overrides (Phase 3c)

- **WHEN** a hidden (`visible: false`) Lottie's element receives an override value
- **THEN** the value lands on the invisible mount harmlessly (like any binding on a hidden element)
  and the B-034 gates are unchanged — the element still contributes no hold, no outro, no settle

#### Scenario: Bind-from-canvas targets the clip's layers (Phase 3c)

- **WHEN** the operator binds a text (or colour) field from canvas onto a Lottie element
- **THEN** the resolver targets the clip's first text (or first non-text) layer by name, the binding
  row shows `lottie <layer>.<prop>`, and a clip with no matching layer refuses the bind with the
  existing "can't bind" feedback

#### Scenario: The GDD carries override fields to the operator (Phase 3c)

- **WHEN** a field bound to a `lottie-override` target is exported
- **THEN** it is emitted in the GDD/manifest exactly like any other field — the Runtime operator app
  surfaces it with no special casing — and both exporters carry the binding with the scene

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
