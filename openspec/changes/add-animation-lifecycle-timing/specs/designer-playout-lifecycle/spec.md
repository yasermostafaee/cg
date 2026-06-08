## ADDED Requirements

### Requirement: Composition has an IN / HOLD / OUT lifecycle via a single out-point

A composition SHALL optionally define a single lifecycle marker `outPoint` located
inside its active region, satisfying `activeRange.in ≤ outPoint ≤ activeRange.out`.
The intro is `[activeRange.in, outPoint]`, the hold is the held `outPoint`, and the
outro is `[outPoint, activeRange.out]`. A composition with **no** `outPoint` SHALL
behave as if the out-point were the **last active frame** (`activeRange.out`): the
whole timeline is the entrance, the hold is the last frame, and the outro is empty.

#### Scenario: Author marks the out-point

- **WHEN** the author drags the out-point marker on the timeline
- **THEN** the composition stores it with `activeRange.in ≤ outPoint ≤
  activeRange.out`, and the IN / HOLD / OUT phases are derived from it

#### Scenario: Absent out-point uses the last active frame

- **WHEN** a composition has no `outPoint`
- **THEN** the runtime treats the out-point as `activeRange.out`, so the entrance
  is the full timeline and the hold is the last frame (the outro is empty)

### Requirement: The default is play-once-and-hold, never a silent loop

`play()` SHALL play the entrance `[activeRange.in → outPoint]` **once** and then
hold (freeze) at `outPoint` — it SHALL NOT loop the timeline and SHALL NOT
auto-play the outro. This is the default for every composition, including one with
no `outPoint`. `stop()` SHALL play `[outPoint → activeRange.out]` and then settle
hidden (an empty outro settles instantly), jumping to `outPoint` first if stopped
before reaching it. Continuous looping SHALL only happen as an explicit, opt-in
choice (see the override requirement) — never as an implicit default.

#### Scenario: Play plays everything up to the out-point and holds

- **WHEN** `play()` is called on a composition with an `outPoint`
- **THEN** all animation in `[activeRange.in → outPoint]` plays once and the
  composition holds at `outPoint` without looping and without playing the outro

#### Scenario: A composition with no out-point plays once and holds

- **WHEN** `play()` is called on a composition with no `outPoint`
- **THEN** the whole timeline plays once and the composition holds the last active
  frame — it does NOT loop

#### Scenario: Stop runs the outro

- **WHEN** `stop()` is called while the composition is holding
- **THEN** the outro plays from `outPoint` to the active-region end (instantly when
  the outro is empty)

### Requirement: Pause and resume

The runtime SHALL expose `pause()` and `resume()`. `pause()` SHALL freeze playback
at the current frame; `resume()` SHALL continue from that frame. These SHALL work
during the intro, the hold, or the outro.

#### Scenario: Pause freezes the current frame

- **WHEN** `pause()` is called during playback
- **THEN** the current frame is held until `resume()` is called, which continues
  from that exact frame

### Requirement: Preview transport is separate, momentary playout commands

The preview modal SHALL present the playout commands as **separate, momentary**
buttons — **Play**, **Pause**, **Stop**, **Next** — each issuing a single command,
mirroring on-air control. **Play** SHALL call `play()`, or `resume()` when the
composition is paused; it SHALL NOT be a toggle and SHALL NOT remain visually
"pressed"/active after a click. **Pause** SHALL call `pause()`, **Stop** SHALL call
`stop()`, and **Next** SHALL call `next()` and SHALL be **disabled when the template
has a single step** (nothing to advance to). Preview-only utilities (e.g. **Reset**)
SHALL be grouped visually apart from the playout commands. All interactive controls
SHALL expose hover / active / focus-visible / disabled states.

#### Scenario: Play is momentary and resumes when paused

- **WHEN** the operator clicks Play while the composition is paused
- **THEN** the runtime resumes from the paused frame; **and** after any Play click
  the button does not stay pressed/active — it is a one-shot command, not a toggle

#### Scenario: Next is disabled for a single-step template

- **WHEN** the composition has a single step
- **THEN** the Next command is disabled; it becomes available only when the template
  exposes more than one step

### Requirement: Preview surfaces important problems prominently

The preview modal SHALL surface a **missing out-point**, a **duplicate data key**,
and **field validation errors** as prominent, distinct notices (callouts), not muted
hints. The data-key form SHALL scroll within its **own region** so a long field list
never pushes the transport or timing controls out of view; the transport commands
and the session timing overrides SHALL stay in a **fixed, always-visible** bar while
the stage stays prominent.

#### Scenario: Duplicate data key is called out

- **WHEN** two fields share the same data key
- **THEN** the preview shows a prominent duplicate-key warning identifying the
  colliding key(s)

#### Scenario: A long field list keeps the transport reachable

- **WHEN** the composition has more data keys than fit the sidebar
- **THEN** the fields scroll within their own region and the transport + timing
  overrides remain visible in the fixed bar

### Requirement: No-code playout timing modes

A composition SHALL carry a playout config with a `mode` of `manual`, `auto-out`,
`loop-cycle`, or `content-driven`, plus `holdMs` and `repeat` where applicable.
`manual` SHALL hold after the intro until `stop()`. `auto-out` SHALL, after
reaching `outPoint` and `holdMs`, play the outro automatically. `loop-cycle` SHALL
repeat `[in→outPoint]` → hold(`holdMs`) → `[outPoint→end]` for `repeat` cycles (or
forever when `repeat` is `infinite`), or until `stop()`. `content-driven` SHALL run
`repeat` content passes (or forever when `repeat` is `infinite`, or until
`stop()`); each pass SHALL take its duration from the runtime-supplied duration
hook (recomputed per pass — the ticker item computes content→duration), and
`holdMs` SHALL NOT apply to `content-driven`. There SHALL be no separate
continuous-loop mode: a looping playout is `loop-cycle` (or `content-driven`) with
`repeat: 'infinite'`. `auto-out` and `loop-cycle` require an explicit `outPoint` to
have an exit segment; with no `outPoint` they have no effect.

#### Scenario: Auto-out plays the outro after the hold

- **WHEN** the mode is `auto-out` with `holdMs = T` and `play()` is called
- **THEN** the intro plays, the composition holds at `outPoint` for T, and then the
  outro plays automatically

#### Scenario: Loop-cycle repeats the full cycle

- **WHEN** the mode is `loop-cycle` with `holdMs = T` and `repeat = N`
- **THEN** the composition repeats `[in→outPoint]` → hold(T) → `[outPoint→end]` N
  times and then stops, and when `repeat` is `infinite` it repeats until `stop()`

#### Scenario: Content-driven honors the repeat field

- **WHEN** the mode is `content-driven` and `play()` is called, with each pass's
  duration supplied by the runtime duration hook
- **THEN** with `repeat = N` the composition runs N passes and then settles, and
  with `repeat = 'infinite'` it loops the content pass continuously until `stop()`;
  `holdMs` has no effect on either case

### Requirement: Mode + hold + repeat are overridable, non-persistent params

The runtime SHALL accept a non-persistent playout override — `mode`, `holdMs`, and
`repeat` — that overrides the composition's stored defaults for a single run
**without changing the stored template**. The override SHALL NOT include any
separate continuous-loop flag; continuous looping is expressed as `mode:
'loop-cycle'` (or `'content-driven'`) with `repeat: 'infinite'`. These params exist
so the designer preview can test playout and so the rundown (the control app) can
drive them live on air later; authoritative live control of these belongs to the
rundown. The template SHALL store only the play-once defaults.

#### Scenario: Override drives playout without persisting

- **WHEN** a playout override (e.g. a different `mode` or `holdMs`) is supplied for
  a run
- **THEN** that run uses the override, and the composition's stored `playout`
  defaults are left unchanged

### Requirement: The preview binds to the effective playout and re-syncs on change

The preview's mode / timing controls SHALL reflect the composition's
**effective** playout (its stored defaults plus the current session override) and
SHALL re-sync whenever the composition changes — an out-point added or removed, or
the stored mode changed — so a control is never stuck on a stale value. When the
composition has no `outPoint`, the preview SHALL clearly indicate "no out-point",
and the `auto-out` / `loop-cycle` modes (which need an out-point) SHALL be disabled.

#### Scenario: Preview reflects out-point presence and the effective mode

- **WHEN** the composition has no `outPoint`
- **THEN** the preview shows a "no out-point" indication and disables the
  `auto-out` and `loop-cycle` modes; **and WHEN** an `outPoint` is later added or
  the stored mode changes, the preview controls re-sync to the new state

#### Scenario: Looping in the preview is an explicit repeat choice, not a silent default

- **WHEN** the designer wants to see a composition loop in the preview
- **THEN** they explicitly choose `loop-cycle` (or `content-driven`) with
  `repeat: 'infinite'`; the preview loops for that session only, and the stored
  template still defaults to play-once

### Requirement: Preview timing overrides are session-only

`mode` SHALL be authored in the inspector, but `mode`, `holdMs`, and `repeat` SHALL
be adjustable in the preview modal (`repeat: 'infinite'` is how the preview loops).
Changing them in the preview SHALL re-run the preview with the overridden playout
for that session only and SHALL NOT change the composition's stored defaults.

#### Scenario: Preview override is session-only

- **WHEN** the designer changes the mode, hold, or repeat in the preview modal
- **THEN** the preview re-runs with the overridden playout, and the composition's
  stored `playout` defaults are unchanged

### Requirement: Lifecycle and timing are exported and preview-faithful

The exported template metadata SHALL carry `outPoint`, `mode`, `holdMs`, `repeat`,
and the outro duration in milliseconds (`(activeRange.out − outPoint) / frameRate ×
1000`). The preview SHALL run the same runtime source as the export, so play,
hold, pause, auto-out, and loop-cycle behave identically in preview and on air.
The non-persistent override (mode + hold + repeat) is NOT exported — the
metadata carries the stored play-once defaults.

#### Scenario: Export carries lifecycle and timing metadata

- **WHEN** a composition with an `outPoint` and a timing config is exported
- **THEN** the template metadata includes `outPoint`, `mode`, `holdMs`, `repeat`,
  and the outro duration in milliseconds

#### Scenario: Preview matches the exported file

- **WHEN** the composition is previewed and then exported
- **THEN** play, hold, pause, auto-out, and loop-cycle behave identically in both
