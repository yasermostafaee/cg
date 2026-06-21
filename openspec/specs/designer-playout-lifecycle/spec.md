# designer-playout-lifecycle Specification

## Purpose

TBD - created by archiving change add-ticker-element. Update Purpose after archive.

## Requirements

### Requirement: Hold duration is its own axis — timed or content-driven

The playout config SHALL model WHAT ENDS A HOLD as an axis orthogonal to the
mode: `holdSource: 'timed' | 'content-driven'` (absent = `'timed'`), usable
under both `auto-out` and `loop-cycle` (ignored by `manual`, where the
operator ends the hold). `'timed'` holds for `holdMs` (today's behaviour,
unchanged). `'content-driven'` holds until the scope's content elements
(tickers) signal completion. `mode` keeps answering "how many open/close
cycles" (`loop-cycle`'s `repeat` counts composition cycles only — a ticker's
own passes are the ticker's `repeat`). `'content-driven'` SHALL no longer be a
mode; a stored legacy `mode: 'content-driven'` SHALL be normalized at parse
time (and defensively in `playoutOf`) to
`mode: 'loop-cycle', holdSource: 'content-driven'` — behaviourally faithful
for every pre-D-028 scene (none had tickers, so holds were zero-length in
both forms).

#### Scenario: Legacy mode value normalizes

- **WHEN** a stored scene with `playout: { mode: 'content-driven', repeat: 2 }`
  is parsed (or handed unparsed to `createRuntime`)
- **THEN** it behaves as `mode: 'loop-cycle', holdSource: 'content-driven',
repeat: 2`, and the exported playout metadata carries the normalized form

#### Scenario: Timed modes are unchanged

- **WHEN** a composition uses `auto-out` or `loop-cycle` with
  `holdSource: 'timed'` (or absent)
- **THEN** holds last `holdMs` exactly as before this change

### Requirement: A content-driven hold ends on the scope's content completion

For `holdSource: 'content-driven'`, the runtime SHALL hold until every
CONTENT SOURCE in the scope completes its own run (`Promise.all` semantics).
Content sources are the scope's finite tickers, its countdown clocks, AND
its finite sequences; wall and countup clocks are NOT content sources and
SHALL never extend the hold. All finite tickers done, all countdowns at
zero, and all finite sequences past their last pass ⇒ the hold ends; an
infinite ticker or an infinite sequence never completes, so the scope holds
until `stop()`; a scope with NO content sources gets a zero-length hold
(deferred like a 0ms timer — a zero-hold root must not settle before its
children receive the play cascade). Each hold entry SHALL reset and restart
the scope's tickers, clocks, and sequences (a fresh crawl / a fresh count /
a fresh run from item 1 per open/close cycle), and a stale completion
(resolving after `stop()` or after the hold already ended) SHALL be
ignored. The runtime SHALL self-wire this from the scope's content
elements — preview and exports need no boot wiring; an explicitly supplied
`RuntimeBootOptions.contentHold` overrides the ROOT scope (external
override and test seam).

#### Scenario: Nested loops — loop-cycle repeat=3 × ticker repeat=2 ⇒ 6 passes

- **WHEN** a composition has `mode: 'loop-cycle', repeat: 3,
holdSource: 'content-driven'` and its ticker has `repeat: 2`
- **THEN** each composition cycle holds for exactly 2 crawl passes (the crawl
  restarting from its entering edge each cycle), then plays the outro; after
  3 cycles the composition settles — the content is seen 6 times with the
  full open/close animation between each pair

#### Scenario: Infinite ticker holds until stop

- **WHEN** a `content-driven` hold's scope contains a `repeat: 'infinite'`
  ticker
- **THEN** completion never fires and the composition holds (crawling) until
  `stop()`

#### Scenario: stop() during a content-driven hold is IMMEDIATE (hard out)

- **WHEN** `stop()` arrives while a content-driven hold is crawling
- **THEN** the hold token invalidates the pending ticker completion, the outro
  plays right away, and the ticker exits mid-scroll with the band — there is
  no built-in waiting for the pass to finish (a graceful/soft stop is a
  rundown-layer feature on the override seam, not runtime behaviour — C-008)

#### Scenario: Stale completion after stop is ignored

- **WHEN** the operator stops a composition during a content-driven hold and
  the abandoned run's completion resolves afterwards
- **THEN** the late resolution does not replay the outro or settle a second
  time

#### Scenario: An explicit boot contentHold overrides the ticker

- **WHEN** `createRuntime` is called with an explicit `contentHold` for a
  scene whose root scope also contains a ticker
- **THEN** the explicit promise governs the root scope's content holds

#### Scenario: A countdown clock alone governs the hold

- **WHEN** an `auto-out` composition with `holdSource: 'content-driven'`
  contains a single countdown clock (`target: { kind: 'duration', ms: 2000 }`)
  and no ticker
- **THEN** the hold lasts until the countdown reaches zero (≈2s of active
  hold time), then the outro plays — the composition exits on its own exactly
  at 00:00, while a wall or countup clock in the same scope would add nothing
  to the wait

#### Scenario: Mixed ticker and countdown — the last content source governs

- **WHEN** a `content-driven` hold's scope contains both a finite ticker and
  a countdown clock
- **THEN** the hold ends only when BOTH have completed (`Promise.all`) —
  whichever finishes last governs — and each hold entry re-runs both (a fresh
  crawl and a fresh count per open/close cycle)

#### Scenario: A finite sequence alone governs the hold

- **WHEN** an `auto-out` composition with `holdSource: 'content-driven'`
  contains a single `repeat: 1` sequence (no ticker, no clock)
- **THEN** the hold lasts until the sequence advances past its last item —
  by dwell timer or by `next()` — then the outro plays, the last item
  staying on screen through the exit; an infinite sequence would hold the
  scope until `stop()`

#### Scenario: All three content-source kinds mixed — the last one governs

- **WHEN** a `content-driven` hold's scope contains a finite ticker, a
  countdown clock, AND a finite sequence
- **THEN** the hold ends only when ALL THREE have completed (`Promise.all`)
  — whichever finishes last governs — and each hold entry re-runs all three
  (a fresh crawl / a fresh count / a fresh run from item 1 per open/close
  cycle)

### Requirement: Root self-settle takes every nested scope off air

The runtime SHALL cascade `stop()` to every nested scope when the root scope
settles on its own (a finite `auto-out` / `loop-cycle` lifecycle completing)
— already-settled children remain no-ops per the state-aware-stop rule — and
SHALL freeze every ticker crawl, so no nested lifecycle, hold timer, or crawl
keeps running under the hidden stage.

#### Scenario: A finite root exits while a nested infinite ticker crawls

- **WHEN** the root composition completes its final cycle and settles while a
  nested instance's ticker is crawling with `repeat: 'infinite'`
- **THEN** the nested scope plays its outro and settles too, its crawl
  freezes, and no timers or animation frames continue under the hidden
  template

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

### Requirement: The lifecycle cascades to nested composition instances

`play()`, `stop()`, `pause()`, `resume()`, and `remove()` SHALL cascade recursively
from the parent to every nested composition instance, for arbitrary nesting depth.
The runtime SHALL build a controller tree that mirrors the composition-instance
scope tree (one lifecycle controller per instance scope), reusing the SAME notion of
scope as nested field-scoping rather than a separate tree. Each scope SHALL run its
OWN lifecycle from its own `lifecycle`/`playout`/`activeRange`/`frameRange`, holding
at its OWN out-point independently of the parent and of its siblings. For v1, a
nested child SHALL start together with its parent (offset 0); element `lifespan`
(visibility gating) SHALL NOT be repurposed as a lifecycle offset.

#### Scenario: Parent play holds each child at its own out-point independently

- **WHEN** `play()` is called on a parent that nests two children with different
  out-points
- **THEN** each child plays its own intro once and holds at its OWN out-point, so two
  children with different out-points hold at different frames at the same time

#### Scenario: Parent stop runs each ACTIVE child's own exit

- **WHEN** `stop()` is called on the parent
- **THEN** each still-active nested child plays its OWN outro `[outPoint →
activeRange.out]` and settles, cascaded from the parent (a child that already
  finished is left untouched — see the state-aware stop requirement)

#### Scenario: Parent pause/resume cascades to children

- **WHEN** `pause()` is called on the parent and later `resume()`
- **THEN** every nested child's playback freezes at its current frame on pause and
  continues from that exact frame on resume

#### Scenario: Cascade reaches arbitrary depth

- **WHEN** a parent nests a child that itself nests a grandchild, and `play()` is
  called on the parent
- **THEN** the grandchild's own lifecycle plays too, holding at its own out-point

### Requirement: The parent keeps its own lifecycle for its direct elements (hybrid)

A parent composition SHALL keep its OWN lifecycle controller for the elements
rendered directly in it, AND cascade to its nested instances. The ROOT scope's
controller SHALL be the one that drives the global lifecycle state machine, the
lifecycle events (`play.start`/`play.end`/`stop.start`/`stop.end`), and any
non-persistent session `playout` override; nested children SHALL run their own
stored `playout` and SHALL NOT emit global lifecycle events.

#### Scenario: A parent out-point applies to direct elements and still cascades

- **WHEN** the parent has its own out-point AND nests a child with a different
  out-point, and `play()` is called
- **THEN** the parent's direct elements hold at the parent's out-point while the
  nested child holds at its own out-point

### Requirement: Frame rate is a single project-level setting shared by all compositions

Frame rate SHALL be a single PROJECT-level setting (`Scene.frameRate`) shared by
every composition and every nested scope; a composition SHALL NOT carry its own
frame rate. A project authored with a legacy per-composition frame rate SHALL have
it stripped on load (coerced to the single project fps); keyframe frame-numbers SHALL
be left unchanged. The runtime SHALL apply the single project fps across ALL scopes
(each scope keeps its own frame range / active range, but not its own fps). The
inspector SHALL display the frame rate **read-only**, because it is set once for the
whole project.

#### Scenario: Every composition shares the one project fps

- **WHEN** a project with several compositions is opened
- **THEN** each composition is shown and played at the single `Scene.frameRate`, and
  no composition carries a frame rate of its own

#### Scenario: A legacy per-composition frame rate is coerced on load

- **WHEN** a project that stored a per-composition frame rate is loaded
- **THEN** the per-composition value is dropped and every composition uses the single
  project fps

#### Scenario: The inspector frame rate is read-only

- **WHEN** the inspector shows a composition's frame rate
- **THEN** it is presented read-only (the single project fps), not an editable
  per-composition control

### Requirement: Cascade stop is state-aware (settled scopes are not re-exited)

A cascaded `stop()` SHALL respect each scope's CURRENT lifecycle state. A scope that
is still ACTIVE — playing its intro, holding, looping (including an infinite loop),
manual, or paused — SHALL play its exit and settle. A scope that has already SETTLED
on its own — an `auto-out` that already exited, or a `loop-cycle` / `content-driven`
that completed its finite cycles/passes — SHALL be a NO-OP: it is left in its
finished state and its exit SHALL NOT be replayed. This SHALL apply to the parent's
own controller too (its own stop only exits when its direct-element lifecycle is
still active).

#### Scenario: A finished child is not re-exited on parent stop

- **WHEN** a nested child has already finished on its own (its `auto-out` exited, or
  its finite `loop-cycle` / `content-driven` completed) and then `stop()` is called
  on the parent
- **THEN** that child is NOT re-exited — it stays in its finished state, and the exit
  is not replayed

#### Scenario: Active, infinite-loop, manual, and paused children still exit

- **WHEN** `stop()` is called on the parent while a child is still active — mid
  intro/hold, looping infinitely, holding in `manual`, or paused
- **THEN** that child plays its own exit and settles

### Requirement: Preview timing overrides are per-scope and session-only

The preview's session-only timing overrides (`mode` / `holdMs` / `repeat`) SHALL be
PER-SCOPE, grouped by the composition-instance tree (the parent plus each nested
child instance, using the SAME instance names as the nested field scopes). Each
scope SHALL carry its own override, applied to the preview run only and addressed by
the scope's instance-name path, so a parent can test each child's timing
independently (e.g. one child loops 3×, another loops infinitely). Changing one
scope's override SHALL affect ONLY that scope and SHALL NOT change any stored
template defaults (consistent with the existing session-only override rule;
authoritative per-child on-air control belongs to the rundown). The preview SHALL
show timing controls for the active composition always, and for a nested scope only
when its mode is timing-relevant (`auto-out` / `loop-cycle` / `content-driven`).

#### Scenario: The preview shows per-scope timing controls grouped by instance

- **WHEN** the preview opens on a parent that nests child instances `home` and `away`
- **THEN** the timing controls are grouped per scope — the parent plus each
  timing-relevant nested instance, labelled by its instance name

#### Scenario: A per-scope override times one child without touching others or the template

- **WHEN** the operator changes a child scope's mode / hold / repeat in the preview
- **THEN** only that scope's preview timing changes for the session (e.g. `home`
  loops 3× while `away` loops infinitely), every other scope and all stored template
  defaults are left unchanged

### Requirement: The Preview modal opens loaded-but-unpainted until Play

The Preview modal SHALL open with the composition loaded but **unpainted** — the runtime in
its native pre-play `cg-pending` state with no graphic on the stage — exactly like an on-air
template after `CG ADD` and before `CG PLAY`. It SHALL NOT auto-render a static frame and
SHALL NOT auto-play. **Play** SHALL reveal the stage and run the intro → hold lifecycle (via
the runtime's existing `cg-pending` clear), and **Stop** SHALL run the outro and settle the
stage blank again. The pre-play (blank) and post-play (painted) states SHALL be identical
between the preview and the on-air / exported runtime, since both run the same runtime
source. This blank-until-play behaviour applies to the **Preview modal only**: the editor
canvas, which shares the same preview harness, SHALL keep rendering the static authoring
frame so the operator can see what they are building before any Play.

#### Scenario: The modal opens blank

- **WHEN** the operator opens the Preview modal on a composition with a painted element
- **THEN** the stage shows no graphic (the runtime is in its `cg-pending` pre-play state),
  with the composition loaded underneath ready to play

#### Scenario: Play paints the stage and runs the lifecycle

- **WHEN** the operator presses Play in the Preview modal
- **THEN** the stage reveals and runs the intro → hold lifecycle, painting the composition;
  the painted result matches what the exported composition shows once playing

#### Scenario: Stop re-blanks the stage

- **WHEN** the operator presses Stop after Play
- **THEN** the outro runs and the stage settles blank again (back to the `cg-pending` state)

#### Scenario: The editor canvas is unaffected

- **WHEN** a composition is rendered on the editor canvas (not the Preview modal)
- **THEN** it still shows the static authoring frame immediately — the blank-until-play
  behaviour does not change the canvas, only the Preview modal

#### Scenario: Pre-play and post-play states match the export

- **WHEN** a composition is previewed and then exported
- **THEN** both surfaces are blank before Play and paint the same frames once playing — the
  preview no longer diverges from the on-air/export pre-play state

### Requirement: Stop settles into a CLEARED terminal state

On `stop()` the composition SHALL play its OUT/outro and then settle into a CLEARED terminal
state in which the stage is HIDDEN (`body.cg-pending` → `.cg-stage { visibility: hidden }`) AND
every content driver — ticker, clock, sequence, and repeater — is HALTED (its animation frame
cancelled, no further frame scheduled). Content-driven elements and nested children therefore go
away with the composition — they SHALL NOT linger frozen on the last frame — with no per-element
opacity-out keyframes required. When the composition has no outro (an empty OUT, e.g. no
out-point), the clear SHALL be immediate on Stop. The mechanism is VISIBILITY (hide + halt): the
element nodes SHALL remain MOUNTED — DISTINCT from CG REMOVE / `remove()`, which unmounts the
stage. A subsequent `play()` SHALL clear `cg-pending` and re-initialise the drivers from a fresh
state so the composition restarts cleanly. When a nested child's outro is longer than its
parent's, the parent's settle SHALL hide and halt the child early — the parent lifecycle
dominates the global clear.

#### Scenario: Stop hides the stage and halts the content drivers

- **WHEN** a composition with a content-driven element (ticker / clock / sequence / repeater) is
  playing and `stop()` is called
- **THEN** after the outro the stage is hidden (`body.cg-pending`) and the element's driver is
  halted — no further animation frame is scheduled — so the content-driven element is no longer
  shown, without any per-element opacity-out

#### Scenario: A composition with no outro clears immediately

- **WHEN** `stop()` is called on a composition whose OUT is empty (no out-point)
- **THEN** the composition settles into the cleared (hidden + halted) state immediately, with no
  outro to play

#### Scenario: The clear is a visibility hide, not a destroy

- **WHEN** a composition has settled into the cleared state on Stop
- **THEN** its element nodes remain mounted in the DOM (hidden via `cg-pending`), unlike CG
  REMOVE / `remove()` which unmounts the stage (`cg-removed`)

#### Scenario: Re-play after a clear restarts cleanly

- **WHEN** `play()` is called after a composition has been cleared by Stop
- **THEN** `cg-pending` is cleared, the drivers re-initialise from a fresh state, and the
  composition runs its intro again and is visible

#### Scenario: A nested child is cleared by the parent Stop

- **WHEN** a parent composition nests a child that contains a content-driven element and `stop()`
  is called on the parent
- **THEN** the nested child is hidden and its driver halted along with the parent — the child
  goes away too; and where the child's outro is longer than the parent's, the parent's settle
  hides and halts the child early
