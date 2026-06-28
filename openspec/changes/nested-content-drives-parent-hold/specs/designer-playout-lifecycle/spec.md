# designer-playout-lifecycle (B-031 delta)

## MODIFIED Requirements

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
until `stop()`; a coordinator with NO coordinated content sources gets a
zero-length hold (deferred like a 0ms timer — a zero-hold root must not settle
before its children receive the play cascade). Each hold entry SHALL reset and
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
