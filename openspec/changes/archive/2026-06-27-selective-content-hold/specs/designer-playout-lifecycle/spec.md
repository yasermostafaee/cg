# designer-playout-lifecycle (D-107 delta)

## MODIFIED Requirements

### Requirement: A content-driven hold ends on the scope's content completion

For `holdSource: 'content-driven'`, the runtime SHALL hold until every CONTENT
SOURCE the scope COORDINATES **that drives the hold** completes its own run
(`Promise.all` semantics). A scope is a **coordinator** when its effective `mode`
is not `manual` and its `holdSource` is `content-driven`. A coordinator
coordinates its OWN hold-driving content sources — its finite tickers, its
countdown clocks, AND its finite sequences **whose `drivesHold` is not `false`**
(D-107 — every content element drives the hold by DEFAULT, i.e. when `drivesHold`
is absent; an element explicitly marked `drivesHold: false` is EXCLUDED and SHALL
NOT gate the hold even when it is infinite/looping, though it still STARTS and
runs unchanged — this is the HOLD, not visibility; wall and countup clocks are
NEVER content sources and SHALL never extend the hold regardless of the flag) —
PLUS the content of every **non-coordinator** nested composition instance,
aggregated recursively up the composition-instance tree and STOPPING at any
nested coordinator (a content-driven nested composition owns its own hold and
self-settles independently, so the parent SHALL NOT wait on it). All coordinated
hold-driving finite tickers done, all coordinated hold-driving countdowns at
zero, and all coordinated hold-driving finite sequences past their last pass ⇒
the hold ends; an infinite ticker or sequence that DRIVES THE HOLD anywhere in
the coordinated set never completes, so the scope holds until `stop()`; a
coordinator with NO coordinated hold-driving content sources — none present, OR
every content source EXCLUDED via `drivesHold: false` — gets a zero-length hold
(deferred like a 0ms timer — a zero-hold root must not settle before its children
receive the play cascade). Each hold entry SHALL reset and restart the
coordinated content (a fresh crawl / a fresh count / a fresh run from item 1 per
open/close cycle), and a stale completion (resolving after `stop()` or after the
hold already ended) SHALL be ignored. The runtime SHALL self-wire this from the
scope's content elements — preview and exports need no boot wiring; an explicitly
supplied `RuntimeBootOptions.contentHold` overrides the ROOT scope (external
override and test seam).

A non-coordinator scope under a coordinator ancestor SHALL NOT start its own
content drivers on its own hold entry; the coordinator ancestor SHALL reset and
start them at the COORDINATOR's hold entry, so content inside a nested composition
begins after the parent's intro (during the parent's hold), not on the play
cascade. A scope with NO coordinator ancestor keeps the per-scope behavior (it
starts its own content at its own hold entry). The `drivesHold` filter applies
ONLY to the hold wait — the coordinator STILL starts (and stops) every content
element, selected or not.

#### Scenario: An excluded content source does not gate the hold, even infinite

- **WHEN** a `content-driven` hold's scope contains a finite ticker that drives
  the hold (default) AND an infinite ticker marked `drivesHold: false`
- **THEN** the hold ends when the finite ticker completes its pass — the excluded
  infinite ticker keeps crawling but does NOT keep the graphic on air — and the
  outro then plays

#### Scenario: Excluding every content source yields a zero-length hold

- **WHEN** a `content-driven` (`auto-out`) scope's only content is excluded
  (every ticker / sequence / countdown carries `drivesHold: false`)
- **THEN** there is no hold-driving content, so the hold is zero-length and the
  composition settles immediately after its outro — consistent with the
  no-content case (the excluded content still ran)

#### Scenario: Default (no drivesHold) keeps all content participating

- **WHEN** a `content-driven` scene authored before D-107 (no `drivesHold` on any
  content element) is played
- **THEN** every ticker / countdown / sequence participates exactly as before —
  an infinite one still holds the scope until `stop()` — so existing scenes behave
  identically (non-breaking)

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
'infinite'` ticker or sequence that drives the hold
- **THEN** the parent's content-driven hold never completes on its own and holds
  until `stop()`

#### Scenario: A content-driven nested composition stays independent

- **WHEN** a manual (or otherwise non-content-driven) parent nests a content-driven
  composition that contains a finite ticker
- **THEN** the nested composition runs and self-settles on its OWN content-driven
  hold and the parent is untouched (the parent does NOT wait on the nested
  content) — preserving today's per-scope holds

#### Scenario: Nested loops — loop-cycle repeat=3 × ticker repeat=2 ⇒ 6 passes

- **WHEN** a composition has `mode: 'loop-cycle', repeat: 3,
holdSource: 'content-driven'` and its ticker has `repeat: 2`
- **THEN** each composition cycle holds for exactly 2 crawl passes (the crawl
  restarting from its entering edge each cycle), then plays the outro; after
  3 cycles the composition settles — the content is seen 6 times with the
  full open/close animation between each pair

#### Scenario: Infinite ticker holds until stop

- **WHEN** a `content-driven` hold's scope contains a `repeat: 'infinite'`
  ticker that drives the hold
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

## ADDED Requirements

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
