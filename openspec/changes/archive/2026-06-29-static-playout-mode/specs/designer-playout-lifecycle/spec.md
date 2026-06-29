# designer-playout-lifecycle (D-114 delta)

## MODIFIED Requirements

### Requirement: No-code playout timing modes

A composition SHALL carry a playout config with a `mode` of `static`, `manual`, `auto-out`,
`loop-cycle`, or `content-driven`, plus `holdMs` and `repeat` where applicable. `static` SHALL be the
mode of a composition with NO out-point: it plays the intro, holds until `stop()`, and hard-cuts with
NO outro (no animated exit) — it requires and uses no out-point. `manual` SHALL hold after the intro
until `stop()`. `auto-out` SHALL, after reaching `outPoint` and `holdMs`, play the outro
automatically. `loop-cycle` SHALL repeat `[in→outPoint]` → hold(`holdMs`) → `[outPoint→end]` for
`repeat` cycles (or forever when `repeat` is `infinite`), or until `stop()`. `content-driven` SHALL
run `repeat` content passes (or forever when `repeat` is `infinite`, or until `stop()`); each pass
SHALL take its duration from the runtime-supplied duration hook (recomputed per pass — the ticker item
computes content→duration), and `holdMs` SHALL NOT apply to `content-driven`. There SHALL be no
separate continuous-loop mode: a looping playout is `loop-cycle` (or `content-driven`) with `repeat:
'infinite'`. `manual` / `auto-out` / `loop-cycle` require an explicit `outPoint` to have an exit
segment; a composition with NO `outPoint` and the DEFAULT (`manual`) mode resolves to `static` (a
single resolver — `playoutOf` — returns `static`, so the runtime, exporter, and inspector agree). The
designer UI never SETS `auto-out` / `loop-cycle` without an out-point, so a composition authored with
no out-point IS `static`; an explicit `auto-out` / `loop-cycle` without an out-point (legacy /
programmatic) keeps its timed / content-driven hold + empty (cut) outro and is NOT coerced.

#### Scenario: A composition with no out-point is static

- **WHEN** a composition has no out-point
- **THEN** its resolved mode is `static`, and `manual` / `auto-out` / `loop-cycle` are disabled in the
  inspector's mode select

#### Scenario: A static graphic cuts on stop

- **WHEN** a `static` composition is stopped
- **THEN** it is removed by a clean cut with no outro — the controller plays the intro, holds until
  `stop()`, then cuts (an empty exit)

#### Scenario: Adding an out-point re-enables the animated modes

- **WHEN** an out-point is added to a `static` composition
- **THEN** `manual` / `auto-out` / `loop-cycle` become selectable again (and `static` is disabled
  while an out-point exists)

#### Scenario: The preview timing controls match the inspector

- **WHEN** the operator opens the preview session-timing mode select for a composition
- **THEN** it disables the same modes as the composition inspector — with no out-point only `static`
  is selectable, with an out-point `static` is disabled — so the preview and the main scene properties
  never disagree

#### Scenario: Auto-out plays the outro after the hold

- **WHEN** the mode is `auto-out` with `holdMs = T` and `play()` is called
- **THEN** the intro plays, the composition holds at `outPoint` for T, and then the outro plays
  automatically

#### Scenario: Loop-cycle repeats the full cycle

- **WHEN** the mode is `loop-cycle` with `holdMs = T` and `repeat = N`
- **THEN** the composition repeats `[in→outPoint]` → hold(T) → `[outPoint→end]` N times and then
  stops, and when `repeat` is `infinite` it repeats until `stop()`

#### Scenario: Content-driven honors the repeat field

- **WHEN** the mode is `content-driven` and `play()` is called, with each pass's duration supplied by
  the runtime duration hook
- **THEN** with `repeat = N` the composition runs N passes and then settles, and with `repeat =
'infinite'` it loops the content pass continuously until `stop()`; `holdMs` has no effect on either
  case

## REMOVED Requirements

### Requirement: Clearing the out-point reverts an out-point-dependent mode to manual

**Reason**: D-114 retargets the clear-revert from `manual` to the new `static` mode (a no-out-point
composition is `static`, not `manual`). Replaced by "Clearing the out-point reverts the mode to
static" below.

## ADDED Requirements

### Requirement: Clearing the out-point reverts the mode to static

Clearing a composition's out-point SHALL rewrite an out-point-DEPENDENT mode (`auto-out` /
`loop-cycle`) to `static` in the SAME store action (one atomic undo step), since a no-out-point
composition has no animated exit. A `manual`/absent composition SHALL be left unchanged (no spurious
write) — `playoutOf` already resolves a no-out-point default to `static`. The revert SHALL apply for
EVERY path that clears the out-point (the inspector Clear button, a drag-off, a marker delete),
because all route through the single clear action. The invariant is ONE-DIRECTIONAL: re-adding an
out-point SHALL NOT auto-restore the prior mode.

#### Scenario: Clearing the out-point in auto-out reverts to static

- **WHEN** the operator clears the out-point while the composition's mode is `auto-out`
- **THEN** the mode becomes `static` in the same atomic action (the rest of the playout — holdMs,
  repeat — is preserved), and one undo restores both the out-point and the prior mode together

#### Scenario: Clearing the out-point in loop-cycle reverts to static

- **WHEN** the operator clears the out-point while the mode is `loop-cycle`
- **THEN** the mode becomes `static`

#### Scenario: Clearing the out-point in manual leaves the playout unchanged (resolves to static)

- **WHEN** the operator clears the out-point while the mode is `manual` (or absent)
- **THEN** the stored playout is left unchanged (no spurious write) and the EFFECTIVE mode resolves to
  `static` (a no-out-point default is `static`)

#### Scenario: Re-adding an out-point does not restore the prior mode

- **WHEN** the operator clears the out-point (reverting to `static`) and later re-adds an out-point
- **THEN** the mode lands on `manual` (the benign default for an out-point composition) — the prior
  `auto-out` / `loop-cycle` is NOT auto-restored
