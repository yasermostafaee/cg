# designer-playout-lifecycle (B-032 ext delta)

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
the coordinated set never completes, so the scope holds until `stop()`.

**B-032 — no effective drivers ⇒ resolve to timed.** A scope whose `holdSource`
is `content-driven` but which has NO effective hold-driving content source — none
present (a content-LESS composition), OR every source EXCLUDED via
`drivesHold: false` — SHALL resolve its hold source to `timed` at the resolution
boundary (the runtime's per-scope `effectivePlayoutFor`, mirrored by the
exporter's `buildPlayoutMetadata` and the Designer Playout inspector via
`@cg/shared-schema`'s `hasEffectiveHoldDrivers`). A content-driven hold with
nothing to wait on is meaningless (it would be a zero-length hold that ignores
`holdMs`); resolving to `timed` honors the authored `holdMs` so the stored
template, the single-file HTML export, and on-air all agree. A composition whose
only hold-driving content lives in a NESTED instance still has effective drivers
and SHALL remain content-driven. Each hold entry SHALL reset and restart the
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

## ADDED Requirements

### Requirement: The Playout inspector shows a content-less hold as timed

The Designer Playout inspector SHALL reflect the same resolution as the runtime:
when a composition has no effective hold-driving content (own or nested, with
`drivesHold !== false`), it SHALL present the hold as `timed` and offer the
authorable `holdMs` control under `auto-out` / `loop-cycle`, even if the stored
`holdSource` is `content-driven` — so the operator is never trapped with a hidden
duration that the runtime silently ignores.

#### Scenario: The holdMs control appears for a content-less content-driven comp

- **WHEN** a composition is stored `holdSource: 'content-driven'` under `auto-out`
  but has no content sources (e.g. its only content was deleted)
- **THEN** the Playout inspector shows the timed `holdMs` control (the hold
  resolves to timed), so the operator can author the duration the runtime honors
