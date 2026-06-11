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
Content sources are the scope's finite tickers AND its countdown clocks;
wall and countup clocks are NOT content sources and SHALL never extend the
hold. All finite tickers done and all countdowns at zero ⇒ the hold ends; an
infinite ticker never completes, so the scope holds until `stop()`; a scope
with NO content sources gets a zero-length hold (deferred like a 0ms timer —
a zero-hold root must not settle before its children receive the play
cascade). Each hold entry SHALL reset and restart the scope's tickers and
clocks (a fresh crawl / a fresh count per open/close cycle), and a stale
completion (resolving after `stop()` or after the hold already ended) SHALL
be ignored. The runtime SHALL self-wire this from the scope's content
elements — preview and exports need no boot wiring; an explicitly supplied
`RuntimeBootOptions.contentHold` overrides the ROOT scope (external override
and test seam).

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
