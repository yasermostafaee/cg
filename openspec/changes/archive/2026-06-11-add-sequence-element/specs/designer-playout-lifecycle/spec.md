# designer-playout-lifecycle

## MODIFIED Requirements

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
