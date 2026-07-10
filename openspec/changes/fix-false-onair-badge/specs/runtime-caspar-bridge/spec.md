# runtime-caspar-bridge — delta for fix-false-onair-badge (B-053)

## MODIFIED Requirements

### Requirement: Stack state updates from real OSC confirmations

The OSC firehose SHALL be consumed and reduced entirely inside the bridge
(interest → rate-limit → change-track → `Reconciler`); only reconciled
`StackItemState` deltas SHALL cross the WebSocket via `StackStateChangedChannel`.
Stack item states SHALL reflect real OSC confirmations from the server, with the
`Reconciler` as the single source of truth — not an internal state machine.
Outbound deltas SHALL be coalesced per `itemId` (last-write-wins) and SHALL NOT
be unbounded-queued.

OSC truth is **transition-driven**: the change-track stage suppresses repeated
identical values, so OSC observations exist only around producer-state
transitions. Verbs that cause no producer transition (`CG UPDATE`) SHALL NOT
depend on OSC for intent completion — their completion signal is the AMCP ack
(see "Transient stack intents complete on ack or expire").

A producer's mere existence is NOT play evidence (B-053): CasparCG stage-plays
the html producer at `CG ADD` while the template page stays hidden until its
`play()` is invoked, and `CG PLAY` causes no OSC-observable transition — a
load-only producer is wire-identical to a played one. The `Reconciler` SHALL
store the raw observation (producer present vs empty) and derive the truth
status at READ time from the item's own intent-side play evidence: a non-empty
producer observation SHALL read `on-air` only for an item the operator has
taken (a `take` intent recorded since the item's record was created), and
`loaded` otherwise; an `empty` observation reads `idle`. Deriving at read time
means a take issued while a load-time observation is still fresh immediately
re-reads as `on-air` (the pre-existing optimistic confirm), and the value
published at observation time equals the value the merge ladder resolves to
after the truth TTL decays — the badge never reverts-and-sticks.

#### Scenario: Real OSC drives stack state

- **WHEN** the server emits OSC (a layer's `foreground/producer` flips to
  `html` / `empty`) **THEN** the affected item's reconciled status updates from
  that real confirmation — `on-air` when a producer is live on a TAKEN item,
  `loaded` when a producer merely exists for a never-taken item, `idle` when
  the layer empties — routed via the `LayerManager`-driven interest set, and
  raw OSC does not cross the WebSocket

#### Scenario: First load per layer rests READY, not ON AIR

- **WHEN** a template is loaded (`CG ADD`, play-on-load OFF) onto a layer whose
  producer report passes the change-tracker (the first load on that layer this
  bridge process, or a post-reconnect resync re-observation) and no take has
  been issued **THEN** the item's published status is `loaded` (badge READY,
  PLAY enabled, UPDATE/OUT gated) — never `on-air` — and it stays `loaded`
  after the OSC truth TTL decays with no further event (no revert-and-stick)

#### Scenario: A take within the fresh-observation window confirms on-air immediately

- **WHEN** the operator takes an item while its load-time producer observation
  is still within the truth TTL **THEN** the reconciled status reads `on-air`
  at once (the same fresh observation now carries play evidence), preserving
  the pre-existing optimistic confirm

#### Scenario: Outbound deltas are coalesced, not unbounded-queued

- **WHEN** OSC churns faster than the UI needs **THEN** the bridge coalesces
  pending `StackItemState` changes per `itemId` (last-write-wins) into bounded
  snapshot publishes rather than queuing every intermediate state
