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

For `holdSource: 'content-driven'`, the runtime SHALL hold until every CONTENT
SOURCE the scope COORDINATES completes its own run (`Promise.all` semantics).
A scope is a **coordinator** when its effective `mode` is not `manual` and its
`holdSource` is `content-driven`. A coordinator coordinates its OWN content
sources — its finite tickers, its countdown clocks, AND its finite sequences
(wall and countup clocks are NOT content sources and SHALL never extend the
hold), each honoring its per-element `drivesHold` (an element with
`drivesHold: false` does not gate the hold) — PLUS the content of every nested
composition instance, aggregated recursively up the composition-instance tree.
For a **non-coordinator** nested child, this coordinator SHALL start AND await
that child's content directly (recursing through it). For a **content-driven**
(coordinator) nested child, the child self-starts and self-settles its OWN
content (honoring its own `drivesHold`), and this coordinator SHALL hold until
that child has SELF-SETTLED — its content complete and its own outro played — so
a content-driven nested composition ALSO drives the parent's hold (B-031), giving
a staggered content-first / background-last exit; an infinite content-driven
nested child never settles, so the parent holds until `stop()`. A NON-coordinator
(e.g. `manual`) parent does NOT aggregate any nested content (it never has). All
coordinated finite tickers done, all coordinated countdowns at zero, all
coordinated finite sequences past their last pass, and all coordinated
content-driven nested children self-settled ⇒ the hold ends; an infinite ticker
or sequence anywhere in the coordinated set never completes, so the scope holds
until `stop()`; a coordinator with NO EFFECTIVE coordinated content sources —
none present (a content-LESS composition), OR every source EXCLUDED (its own
`drivesHold: false` or a parent's per-instance `holdOverrides`) — SHALL resolve its
hold source to `timed` at the resolution boundary (the runtime's per-scope
`effectivePlayoutFor`, mirrored by the exporter's `buildPlayoutMetadata` and the
Designer Playout inspector via `@cg/shared-schema`'s `hasEffectiveHoldDrivers`), so
the authored `holdMs` is honored (a content-driven hold with nothing to wait on is
meaningless) and the stored template, the single-file HTML export, and on-air all
agree; a composition whose only hold-driving content lives in a NESTED instance
still has effective drivers and SHALL remain content-driven (B-032). Each hold
entry SHALL reset and
restart the coordinated content (a fresh crawl / a fresh count / a fresh run from
item 1 per open/close cycle), and a stale completion (resolving after `stop()` or
after the hold already ended) SHALL be ignored. The runtime SHALL self-wire this
from the scope's content elements — preview and exports need no boot wiring; an
explicitly supplied `RuntimeBootOptions.contentHold` overrides the ROOT scope
(external override and test seam).

A non-coordinator scope under a coordinator ancestor SHALL NOT start its own
content drivers on its own hold entry; the coordinator ancestor SHALL reset and
start them at the COORDINATOR's hold entry, so content inside a nested composition
begins after the parent's intro (during the parent's hold), not on the play
cascade. A scope with NO coordinator ancestor keeps the per-scope behavior (it
starts its own content at its own hold entry). A content-driven nested child still
self-starts its own content (it is a coordinator) — the parent does not double-start
it; the parent only awaits its self-settle.

#### Scenario: A content-driven nested composition drives the parent's hold

- **WHEN** a content-driven (`auto-out`) parent's only finite content lives inside a
  nested composition instance that is ITSELF content-driven (a coordinator with a
  finite ticker / sequence / countdown, `drivesHold` default)
- **THEN** the parent holds until that nested composition self-settles (its content
  completes and it plays its own outro), then the parent plays its outro — the nested
  content drives the parent's hold (it is no longer skipped), content-first then
  background-last

#### Scenario: Per-element drivesHold opts nested content out of the parent's hold

- **WHEN** the content inside a content-driven nested composition is excluded
  (`drivesHold: false`)
- **THEN** that nested composition gets a zero-length hold and self-settles quickly,
  so the parent does NOT wait on the excluded content — it settles well before the
  excluded content would have completed (it still runs)

#### Scenario: An infinite content-driven nested composition holds the parent until stop

- **WHEN** a content-driven parent nests a content-driven composition whose content is
  infinite (`repeat: 'infinite'`)
- **THEN** the nested composition never self-settles, so the parent's content-driven
  hold never completes on its own and holds until `stop()`

#### Scenario: A parent holds for content inside a nested composition

- **WHEN** a content-driven (`auto-out`) composition has NO direct content but
  nests a composition instance (non-content-driven) that contains a finite ticker
  / sequence / countdown
- **THEN** the parent holds until that nested content completes and only then plays
  its outro — it does NOT get a zero-length hold and close early

#### Scenario: Nested content starts at the parent's hold-start, not at play

- **WHEN** Play is pressed on such a parent
- **THEN** the nested composition's content begins only after the parent's intro
  finishes (at the parent's hold entry), not the instant Play is pressed

#### Scenario: Infinite nested content holds the parent until stop

- **WHEN** the nested composition (non-content-driven) contains a `repeat:
'infinite'` ticker or sequence
- **THEN** the parent's content-driven hold never completes on its own and holds
  until `stop()`

#### Scenario: A content-driven nested composition under a non-coordinator parent stays independent

- **WHEN** a manual (or otherwise non-content-driven) parent nests a content-driven
  composition that contains a finite ticker
- **THEN** the nested composition runs and self-settles on its OWN content-driven
  hold and the parent is untouched (a non-coordinator parent does NOT wait on the
  nested content) — preserving today's per-scope holds

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

#### Scenario: A content-less content-driven auto-out holds for holdMs

- **WHEN** a composition has `mode: 'auto-out'`, `holdSource: 'content-driven'`,
  and `holdMs: N`, but NO content sources (e.g. the content was deleted after the
  hold source was set)
- **THEN** the resolution boundary falls `holdSource` back to `timed`, so the hold
  lasts ≈ `N` ms before the outro (not a zero-length hold) — in the stored
  template AND the single-file HTML export

#### Scenario: A content-less content-driven loop-cycle holds for holdMs each cycle

- **WHEN** a content-less composition is `loop-cycle` + `content-driven` with
  `holdMs: N`
- **THEN** each between-cycle hold lasts ≈ `N` ms (resolved to timed), not ~0

#### Scenario: Nested-only content keeps the hold content-driven

- **WHEN** a composition has no OWN content but nests a composition instance that
  contains a hold-driving content source
- **THEN** it has effective drivers, so its hold stays `content-driven` and ends
  on that nested content's completion (NOT resolved to timed)

#### Scenario: An exclusively-excluded composition resolves to timed

- **WHEN** every content source in a content-driven composition is excluded via
  `drivesHold: false`
- **THEN** there are no effective drivers, so the hold resolves to `timed` and
  honors `holdMs`

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
**without changing the stored template** (the designer preview / rundown session
override). The override SHALL NOT include any separate continuous-loop flag;
continuous looping is expressed as `mode: 'loop-cycle'` (or `'content-driven'`)
with `repeat: 'infinite'`. These params exist so the designer preview can test
playout and so the rundown (the control app) can drive them live on air later;
authoritative live control of these belongs to the rundown.

B-032 — the template MAY ALSO STORE an authored timed `holdMs` on `scene.playout`:
the inspector's Playout section authors it (alongside `mode` and the `outPoint`
marker) for an `auto-out` / `loop-cycle` composition with a TIMED hold, so a
STANDALONE export / on-air playback (no rundown) holds for the authored duration
rather than collapsing to 0. The session override still layers on top via
`effectivePlayoutFor` (`override.holdMs ?? stored.holdMs`), so a preview / rundown
can still retune the hold for a run without changing the stored default. `repeat`
remains an override-only (preview / rundown) param. A composition with no stored
`holdMs` and no override holds 0 (the prior behaviour — no hold authored).

#### Scenario: Override drives playout without persisting

- **WHEN** a playout override (e.g. a different `mode` or `holdMs`) is supplied for
  a run
- **THEN** that run uses the override, and the composition's stored `playout`
  defaults are left unchanged

#### Scenario: An authored timed holdMs is stored and exported

- **WHEN** the inspector sets a timed `holdMs` for a content-less `auto-out` /
  `loop-cycle` composition
- **THEN** the value is stored on `scene.playout.holdMs`, the single-file export
  bakes it (`buildPlayoutMetadata`) and the inlined scene carries it, so a
  standalone export holds for the authored duration (both `auto-out` and
  `loop-cycle`, including the between-cycle hold) instead of behaving like 0

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

`mode` AND the timed `holdMs` SHALL be AUTHORABLE in the inspector (stored on
`scene.playout`); `mode`, `holdMs`, and `repeat` SHALL ALSO be adjustable in the
preview modal (`repeat: 'infinite'` is how the preview loops). The inspector's
`holdMs` control SHALL appear only for a TIMED hold under `auto-out` / `loop-cycle`
(a content-driven hold ignores `holdMs`). A preview change SHALL re-run the preview
with the overridden playout for that session only — layered on the stored defaults
(`override ?? stored`) — and SHALL NOT change the composition's stored defaults.

#### Scenario: Preview override is session-only

- **WHEN** the designer changes the mode, hold, or repeat in the preview modal
- **THEN** the preview re-runs with the overridden playout, and the composition's
  stored `playout` defaults are unchanged

#### Scenario: The inspector authors a stored holdMs, the preview override still layers over it

- **WHEN** the inspector authors a stored `holdMs` and the preview then sets a
  different `holdMs` override
- **THEN** the preview run uses the override while the stored value (and the
  export) keep the authored default — neither changes the other; and the inspector
  `holdMs` control is hidden for a `manual` or content-driven hold

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

### Requirement: Per-element ticker timing overrides in preview

The preview's session-only TICKER timing override SHALL be PER-ELEMENT, addressed by the ticker's
`elementId` — not per-scope. The override SHALL carry, for each ticker, its own `repeat` (`N` |
`'infinite'`) and `cycleBoundary` (`'seamless'` | `'drain'`), and the runtime SHALL apply each
ticker's override to THAT ticker's own driver (two tickers in one scope are two independent drivers).
The per-scope LIFECYCLE override (`mode` / `holdSource` / `holdMs` / `repeat`) is unchanged. The
preview SHALL enumerate EVERY ticker of a scope (recursing containers) and show one timing row per
ticker, labelled by the element's name, nested under that scope's lifecycle controls. These overrides
SHALL be session-only — applied to the preview run by rebuilding the runtime, never written to the
stored template. A scope with exactly one ticker SHALL behave as before (one row, applied to its own
driver). (Phase 1 covers tickers; sequences and countdown clocks are a later phase.)

#### Scenario: Two tickers in one scope are tuned independently

- **WHEN** a composition contains two tickers and the operator sets ticker A to one repeat /
  cycle-seam and ticker B to another in the preview timing panel
- **THEN** the preview shows one timing row per ticker (by name) and each ticker's own driver honors
  its OWN repeat / cycle-seam — A's setting does not affect B

#### Scenario: A single-ticker scope is unchanged

- **WHEN** a scope contains exactly one ticker
- **THEN** it shows one ticker timing row and behaves exactly as before (no regression)

#### Scenario: Per-element ticker overrides are session-only

- **WHEN** the operator sets per-ticker timing in the preview
- **THEN** only the preview run is affected — every ticker element's stored `repeat` /
  `cycleBoundary` and the rest of the template are left unchanged

### Requirement: The content-driven hold control is offered for content in a nested composition

The inspector's Playout section AND the preview's per-scope timing controls SHALL
offer the content-driven hold source whenever the composition contains finite
content — a ticker, a countdown clock, or a sequence — directly OR inside a nested
`composition` instance, resolving the referenced composition's layers (via
`scene.compositions`) and recursing through them with a cycle guard (a visited
set), exactly as they already recurse into a `container`'s children. A composition
whose only finite content lives inside a nested composition SHALL therefore present
the hold-source control in BOTH the inspector and the preview (B-031 — the preview's
per-scope content check was previously SHALLOW, hiding the content-driven option for
a nested-only parent).

#### Scenario: Hold control offered for content inside a nested composition

- **WHEN** a composition's only finite content (a ticker / countdown / sequence)
  lives inside a nested `composition` instance and the mode is not `manual`
- **THEN** the inspector Playout section offers the hold-source control (timed /
  content-driven) for that composition

#### Scenario: The preview offers the content-driven hold for nested-only content

- **WHEN** the preview opens on a parent whose only finite content lives inside a
  nested composition instance and the parent's mode is timing-relevant
  (`auto-out` / `loop-cycle`)
- **THEN** the parent's per-scope preview timing offers the content-driven hold
  source (its content check recurses the nested composition)

#### Scenario: No false offer and no infinite recursion on cyclic references

- **WHEN** a composition nests only static (non-content) compositions, or the
  composition graph contains a reference cycle
- **THEN** the hold-source control is NOT offered for a purely-static nest, and
  the recursion terminates (each referenced composition is visited at most once)

### Requirement: The designer selects which content drives the content-driven hold

Every ticker, sequence, and clock element SHALL carry an OPTIONAL `drivesHold`
boolean. Absent ⇒ the element participates in (drives) its scope's content-driven
hold — the pre-D-107 all-content behaviour — so the field is purely additive and
NON-BREAKING (no schema-version bump). When the hold is content-driven, the
inspector's Playout section SHALL present a checklist of the composition's own
content elements ("which content closes the graphic?"), pre-checked, each toggling
that element's `drivesHold`. The checklist SHALL list tickers, sequences, and
COUNTDOWN clocks (recursing groups/containers) and SHALL NOT list wall or countup
clocks (they never complete, so they can never drive a hold). Unchecking an
element SHALL set `drivesHold: false`, excluding it from the hold WITHOUT changing
that it still starts and renders. Start-marker selectivity is OUT of scope
(deferred): `drivesHold` governs only the HOLD.

#### Scenario: The checklist is offered and pre-checked when the hold is content-driven

- **WHEN** a composition with multiple content elements has `mode` not `manual`
  and the hold source set to `content-driven`
- **THEN** the Playout section shows one checkbox per content element (ticker /
  sequence / countdown clock), all checked by default (every element participates)

#### Scenario: Unchecking an element excludes it from the hold

- **WHEN** the operator unchecks a content element in the checklist
- **THEN** that element's `drivesHold` becomes `false`, the change persists on the
  element, and the runtime hold no longer waits for it (it still runs)

#### Scenario: Wall and countup clocks never appear in the checklist

- **WHEN** the composition contains a wall or countup clock alongside a ticker
- **THEN** only the ticker (and any countdown clock / sequence) is listed — the
  wall / countup clock is not offered, because it can never drive the hold

#### Scenario: No content is selected yields a zero-length hold

- **WHEN** the operator unchecks every content element (or the composition has
  none of its own to list)
- **THEN** the content-driven hold is zero-length, consistent with the no-content
  case (the unchecked content still runs, it just no longer holds the graphic)

### Requirement: The Playout checklist surfaces nested-composition hold-driving content (read-only)

When the active composition's hold is content-driven, the Playout section SHALL surface the
hold-driving content (`ticker` / `sequence` / countdown `clock`) inside each IMMEDIATE nested
composition instance as **WRITABLE** rows — not read-only. Each row SHALL show a checkbox reflecting
the element's EFFECTIVE participation in THIS parent's hold (the instance's per-instance override if
set, else the element's own `drivesHold`; absent ⇒ drives). Toggling a row SHALL write a per-instance
override on the parent's composition-instance element (NOT on the shared child), so other instances of
the same child are unaffected. The instance's drill-in SHALL remain (to edit the shared child or a
deeper instance level); deeper nested content (inside the instance's OWN nested instances) is edited by
drilling in, one level at a time. Rows for a finite countdown clock and finite/infinite ticker /
sequence are all listed; wall/countup clocks never appear (they cannot end a hold).

#### Scenario: Nested content is listed with a writable toggle

- **WHEN** a parent nests a composition instance whose referenced composition contains hold-driving
  content
- **THEN** the parent's content-driven checklist lists that content with a writable "drives the hold"
  checkbox (not a read-only indicator), reflecting its effective participation, plus the drill-in

#### Scenario: Toggling a nested row writes a per-instance override

- **WHEN** the operator toggles a nested row off (or on) in the parent
- **THEN** the change is stored as `holdOverrides[elementId]` on the parent's composition-instance
  element, leaving the shared child element's own `drivesHold` untouched

#### Scenario: Deeper nested content is edited by drilling in

- **WHEN** the nested instance itself contains a deeper composition instance with hold-driving content
- **THEN** the parent surfaces the immediate level's content as writable rows and the operator drills
  into the instance to edit the deeper level's per-instance overrides there

#### Scenario: A content-driven (coordinator) nested child stays read-only

- **WHEN** the immediate nested child is itself content-driven (a coordinator — the parent awaits its
  settle, so a per-instance override on its content would be inert)
- **THEN** the parent surfaces that child's content READ-ONLY (a drill-in, not writable rows); the
  operator edits the child's own participation by drilling in

### Requirement: Clearing the out-point reverts an out-point-dependent mode to manual

Clearing a composition's out-point while its mode is `auto-out` or `loop-cycle` SHALL set the mode to
`manual` in the SAME store action (one atomic undo step). Those modes require an out-point (an exit
segment to start the animated outro from), so without this the composition would claim an animated
exit with no marker to start from. The revert SHALL apply for EVERY path that clears the
out-point (the inspector Clear button, a drag-off, a marker delete), because all route through the
single clear action. When the mode is already `manual`, clearing the out-point SHALL leave the
playout unchanged (no spurious write). The invariant is ONE-DIRECTIONAL: re-adding an out-point SHALL
NOT auto-restore the prior mode.

#### Scenario: Clearing the out-point in auto-out reverts to manual

- **WHEN** the operator clears the out-point while the composition's mode is `auto-out`
- **THEN** the mode becomes `manual` in the same atomic action (the rest of the playout — holdMs,
  repeat — is preserved), and one undo restores both the out-point and the prior mode together

#### Scenario: Clearing the out-point in loop-cycle reverts to manual

- **WHEN** the operator clears the out-point while the mode is `loop-cycle`
- **THEN** the mode becomes `manual`

#### Scenario: Clearing the out-point in manual changes nothing

- **WHEN** the operator clears the out-point while the mode is already `manual`
- **THEN** the playout is left unchanged (no mode write)

#### Scenario: Re-adding an out-point does not restore the prior mode

- **WHEN** the operator clears the out-point (reverting to manual) and later re-adds an out-point
- **THEN** the mode stays `manual` (the prior `auto-out` / `loop-cycle` is NOT auto-restored)

### Requirement: Nested content participation is a per-instance override on the parent

A nested content element's participation in its parent hold SHALL resolve to the composition-instance's
optional `holdOverrides[id]` (keyed by the nested content element's stable id) when that key is defined,
else the element's own `drivesHold !== false` (absent ⇒ drives, `false` ⇒ excluded). The
override SHALL affect ONLY the parent's hold aggregation — never the shared child element, never the
child composition's OWN hold, never whether the content starts / runs / is visible (an excluded looping
element keeps running until the parent's exit). Each composition-instance level overrides only its
referenced composition's OWN direct content (recursing containers, NOT deeper instances); a deeper
instance carries its own `holdOverrides`, applied at its level (cascade per level). The field is
OPTIONAL and additive — scenes without it are unchanged, it round-trips through `.vcg` and single-file
HTML export, and the schema version is NOT bumped.

#### Scenario: An instance override excludes a nested element from the parent hold

- **WHEN** a parent nests a child with a finite ticker and a `repeat: 'infinite'` sequence, and the
  parent sets `holdOverrides[sequenceId] = false` on that instance
- **THEN** the parent's content-driven hold ends when the finite ticker completes (then plays its
  outro), while the looping sequence keeps running until the parent's exit — matching the
  single-composition behaviour of unchecking the sequence

#### Scenario: Per-instance isolation

- **WHEN** the same child composition is instanced in two parents (or twice in one parent) and only the
  first instance sets `holdOverrides[id] = false`
- **THEN** the second instance's hold is unaffected — its element resolves to the element's own
  `drivesHold`

#### Scenario: Fallback when no override

- **WHEN** a nested content element has no `holdOverrides` entry on its instance
- **THEN** its effective participation falls back to its own `drivesHold` (absent ⇒ drives, `false` ⇒
  excluded) — backward compatible with pre-D-112 scenes

#### Scenario: Overrides survive round-trips

- **WHEN** a scene with per-instance `holdOverrides` is packed to `.vcg` and unpacked, or exported as
  single-file HTML and re-parsed
- **THEN** the `holdOverrides` survive unchanged and the scene validates

### Requirement: An infinite-repeat hold driver is flagged on own and nested rows (supersedes D-111)

When the hold is content-driven, the Playout section SHALL flag any hold driver — an own-content row OR
a writable nested row — whose element has `repeat: 'infinite'` and is EFFECTIVELY participating (own:
`drivesHold !== false`; nested: the per-instance effective value is `true`): such a driver never
completes, so the graphic holds until `stop()` (it won't auto-close). The flag SHALL be inline on that
row and SHALL clear when the element is excluded (own `drivesHold === false`, or the nested override
turns it off) or given a finite `repeat`. When EVERY effective hold driver of the composition (own plus
those reached through nested instances, overrides applied) is infinite-repeat, the warning SHALL be
PROMINENT at the checklist level (an alert), not only per-row. A finite-repeat driver SHALL show no
warning (no false positives). This is presentation only — the runtime behaviour (infinite content ⇒
hold until `stop()`) is unchanged.

#### Scenario: An effectively-driving infinite nested row is flagged

- **WHEN** a writable nested row's element has `repeat: 'infinite'` and is effectively driving the
  parent's hold (override unset or `true`)
- **THEN** the row shows an inline warning that the graphic won't auto-close

#### Scenario: Excluding the infinite nested element via override clears the warning

- **WHEN** the operator toggles that nested infinite row off (per-instance override `false`)
- **THEN** the inline warning clears and the element no longer counts toward the prominent
  all-infinite alert

#### Scenario: A finite nested driver shows no warning

- **WHEN** a nested hold driver's `repeat` is finite (or it is a countdown clock, always finite)
- **THEN** no warning is shown for it (no false positives)

### Requirement: The Playout inspector shows a content-less hold as timed

The Designer Playout inspector SHALL reflect the same resolution as the runtime:
when a composition has no effective hold-driving content (own or nested, with
`drivesHold !== false` and no per-instance `holdOverrides` excluding it), it SHALL
present the hold as `timed` and offer the authorable `holdMs` control under
`auto-out` / `loop-cycle`, even if the stored `holdSource` is `content-driven` — so
the operator is never trapped with a hidden duration that the runtime silently
ignores.

#### Scenario: The holdMs control appears for a content-less content-driven comp

- **WHEN** a composition is stored `holdSource: 'content-driven'` under `auto-out`
  but has no content sources (e.g. its only content was deleted)
- **THEN** the Playout inspector shows the timed `holdMs` control (the hold
  resolves to timed), so the operator can author the duration the runtime honors

### Requirement: A hidden content element is inert

A content element marked `visible: false` SHALL be fully inert for playout: it SHALL NOT drive a
content-driven hold — neither its own scope's hold nor (via a parent's `holdOverrides`) a parent's —
regardless of `drivesHold`, and SHALL NOT be rendered, listed in the Playout hold checklist (own or
nested), counted toward the infinite-repeat warning, shown in the preview per-element timing
controls, raised as an export preflight diagnostic, or (a hidden sequence) make the scene steppable
via the preview transport Next control. This is a HARD gate that takes precedence over
`drivesHold` and per-instance `holdOverrides`: so a hidden `repeat: 'infinite'` ticker / sequence no
longer freezes the graphic — a composition whose only hold-driving content is hidden has NO effective
drivers and resolves its hold to `timed` (B-032). Because the gate is applied where each runtime
content-driver is BUILT (so a hidden element is absent from the unfiltered `contentDrivers` array a
parent override re-filters), a parent `holdOverrides` force-include CANNOT resurrect a hidden nested
element. Unhiding the element restores all of the above.

Visibility PROPAGATES through ancestors: a composition INSTANCE or container marked `visible: false`
makes its ENTIRE subtree inert — EVERY descendant content element, regardless of the descendant's own
`visible`. The hold aggregation, the checklist walks (own + nested), the preview per-element timing,
the export preflight, and the transport-step (`canStepScene`) predicate SHALL all SHORT-CIRCUIT the
whole subtree the moment they descend into a hidden instance/container, BEFORE collecting any
descendant driver — mirroring render (a hidden instance is `display: none`, so its subtree is not
drawn). So a VISIBLE infinite sequence inside a HIDDEN instance does not keep the parent open.

#### Scenario: A hidden infinite driver does not force an infinite hold

- **WHEN** a content-driven composition's only hold-driving content is a `repeat: 'infinite'` ticker
  or sequence that is hidden (`visible: false`)
- **THEN** the hidden element does not drive the hold, so the composition has no effective drivers and
  resolves to a timed hold (honoring `holdMs`) and settles — it is not frozen until `stop()`

#### Scenario: A hidden element is absent from the hold checklist and preview timing

- **WHEN** a content element (ticker / sequence / countdown clock) is hidden
- **THEN** it is not listed in the Playout "which content closes the graphic?" checklist (own or
  nested), not counted toward the infinite-repeat warning, and not shown in the preview per-element
  timing controls

#### Scenario: A hidden element is not rendered

- **WHEN** a content element is hidden
- **THEN** it is not rendered (`display: none`) on the canvas, in the preview, and in exports

#### Scenario: The hidden gate overrides drivesHold and per-instance overrides

- **WHEN** a hidden content element has `drivesHold: true` (or a parent's `holdOverrides` would
  force-include it)
- **THEN** it is STILL inert (the `visible: false` gate wins) — it does not drive the hold

#### Scenario: A parent override cannot resurrect a hidden nested driver

- **WHEN** a parent composition instances a child whose only content is a hidden `repeat: 'infinite'`
  driver, and the parent sets a per-instance `holdOverrides` entry force-including that driver
- **THEN** the override is a no-op (the hidden element is absent from the runtime's `contentDrivers`),
  so the parent has no effective drivers and resolves its hold to `timed` and settles
- **AND** the parent's nested hold checklist shows no row for that hidden driver; un-hiding it restores
  the row and its hold participation

#### Scenario: A hidden finite ticker raises no export preflight diagnostic

- **WHEN** a composition has a TIMED hold and a finite-repeat ticker that is hidden
- **THEN** the single-file exporter does not emit the `ticker-finite-with-timed-hold` info diagnostic
  for it (a hidden ticker is inert, so there is nothing to warn about)

#### Scenario: A hidden sequence does not make the scene steppable

- **WHEN** the only sequence in the scene (or its compositions) is hidden
- **THEN** the preview transport's Next control is disabled (the scene is not steppable) — un-hiding
  the sequence re-enables it

#### Scenario: A hidden composition instance makes its whole subtree inert

- **WHEN** a content-driven parent instances a child whose own content is VISIBLE (e.g. a
  `repeat: 'infinite'` sequence) but the INSTANCE is hidden (`visible: false`), and a separate VISIBLE
  finite driver is what should close the parent
- **THEN** the hidden instance's whole subtree drives nothing — the parent settles when the visible
  finite driver completes (it is NOT held open by the hidden instance's visible infinite content)
- **AND** the hidden instance contributes no checklist rows, no preview-timing scope, and no render;
  un-hiding the instance restores its subtree's participation

### Requirement: A content-driven hold re-arms on every replay

Every `play()` SHALL re-arm the content-driven hold so a REPLAY (calling `play()` again without
re-creating the runtime, e.g. pressing Play twice in the preview) waits for content exactly like the
first play. In particular, each scope's self-settle signal (the B-031 deferred a content-driven
parent awaits for a nested CONTENT-DRIVEN (coordinator) child) SHALL be re-minted for the new run
before the controller cascade, so the parent — which captures it fresh at each hold entry — waits on
a PENDING settle rather than the one already resolved on the previous play. A replay SHALL NOT close
instantly; only re-opening the preview must not be required to restore correct waiting.

#### Scenario: Replaying a content-driven scene waits again (own content)

- **WHEN** a content-driven hold with finite OWN content (a ticker / sequence / countdown) settles,
  and `play()` is called again without re-creating the runtime
- **THEN** the hold re-arms and waits for the content again, exactly like the first play

#### Scenario: Replaying re-arms a nested content-driven child's hold

- **WHEN** a content-driven parent whose hold is driven by a nested CONTENT-DRIVEN (coordinator)
  composition has settled, and `play()` is called again
- **THEN** the parent waits again on that nested composition's fresh self-settle (it does NOT close
  instantly on the already-resolved settle from the previous play)
