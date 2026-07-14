# runtime-caspar-bridge Specification (delta)

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

**Play evidence is a CLAIM, and a failed command SHALL retract its own claim (B-079).**
OSC is bound independently of the AMCP link and keeps arriving across a dead AMCP
connection, so producer-present evidence can outlive the ability to command the server.
Because the truth derivation sits ABOVE the ack in the merge ladder, a take that set play
evidence and then FAILED on the wire would otherwise read `on-air` off an unrelated
producer — a solid ON AIR badge for a `CG PLAY` that never reached CasparCG. Therefore: a
take intent SHALL record the item's PRIOR play evidence, and a **failed ack** (or an
expiry) for that take SHALL RESTORE it, so the take's own unproven claim is withdrawn.

The retraction SHALL be scoped to the claim the failed command made, and to nothing else:

- A take on a never-played item that then fails SHALL leave the item reading `loaded` when
  a producer is present — true, and never `on-air`.
- A re-take of an item that is ALREADY on air and then fails SHALL leave it reading
  `on-air` — it genuinely is. A failed command SHALL NOT demote a graphic that is really
  on air, because a false `idle`/`loaded` would HIDE a live graphic, which is the more
  dangerous error direction.
- A failed `update` or `out` SHALL NOT alter play evidence at all.

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

#### Scenario: A FAILED take does not read on-air off a stale producer

- **WHEN** a take's command fails on the wire (the AMCP link is down, or the send is
  rejected) while a producer observation for that layer is still fresh **THEN** the item
  SHALL NOT read `on-air` — the failed take retracts the play evidence it claimed, and the
  item reads `loaded` (the producer is there; it was never played), with the failure
  surfaced

#### Scenario: A failed re-take never demotes a genuinely on-air item

- **WHEN** an item that is ALREADY confirmed on air is re-taken and that command fails
  **THEN** the item still reads `on-air` — the retraction restores the item's PRIOR
  evidence, so a real live graphic is never hidden by a failed command

#### Scenario: Outbound deltas are coalesced, not unbounded-queued

- **WHEN** OSC churns faster than the UI needs **THEN** the bridge coalesces
  pending `StackItemState` changes per `itemId` (last-write-wins) into bounded
  snapshot publishes rather than queuing every intermediate state

### Requirement: Transient stack intents complete on ack or expire

The `playing`, `updating` and `exiting` stack-item statuses SHALL be **transient**: they
SHALL NEVER be a permanent resting state. The Reconciler SHALL settle a
transient intent when the AMCP ack of the intent's own command arrives — the
`CG PLAY` line for a take; the `CG UPDATE` line for an update; the single `CLEAR` the
bridge emits for an out:

- An OK ack SHALL settle the item to its underlying state — the pre-update
  status (normally `playing`) for an update; `idle` for an out. The ack means
  **accepted by CasparCG**; it is not proof the template applied the value
  (B-041's `202`-plus-template-failure history) — deeper applied-verification
  is out of scope of this requirement.
- A failure ack SHALL surface the existing `error` state with its `errorCode`, and for a
  take SHALL additionally retract the play evidence that take claimed (see "Stack state
  updates from real OSC confirmations").
- An ack for a superseded intent (an older sequence than the item's latest)
  SHALL NOT mutate the item's state.

If no ack arrives within a bounded time (5 s), the bridge SHALL expire the
intent to an explicit **`unconfirmed`** status (with an `errorCode`), surfaced
to the operator UI — never a silent revert to the prior status, never a fake
success, never an indefinite `playing`/`updating`/`exiting`. **A take SHALL arm the same
bounded timer** — without it an unsettled take rests on its optimistic `playing`/`on-air`
claim forever, with nothing to bound it. A late OK ack after expiry
SHALL settle the item honestly. Any subsequent operator intent SHALL overwrite
an `unconfirmed` state.

#### Scenario: An update settles when CasparCG acks it

- **WHEN** the operator updates an on-air item and CasparCG acks the
  `CG UPDATE` with `202` **THEN** the item's status returns to its underlying
  on-air state within a bounded time — regardless of whether any OSC event
  accompanies the update (none does: an update causes no producer transition)

#### Scenario: An out settles to idle on the CLEAR ack

- **WHEN** the operator takes an item out and CasparCG acks the `CLEAR` **THEN**
  the item rests at `idle` — never permanently `exiting`

#### Scenario: A lost ack expires to an explicit unconfirmed state

- **WHEN** the bridge sends a `CG UPDATE` and no ack arrives within the bound
  (e.g. CasparCG stopped mid-update) **THEN** the item lands in the explicit
  `unconfirmed` (or `error`, for a detected send failure) state visible in the
  UI — the badge never sticks on "UPDATING"

#### Scenario: A take whose ack never arrives expires, and gives back its claim

- **WHEN** the bridge sends a `CG PLAY` and no ack arrives within the bound **THEN** the
  item lands in the explicit `unconfirmed` state and the take's unproven play evidence is
  retracted — the badge never rests on an unbounded optimistic `playing`/`on-air`

#### Scenario: A subsequent intent clears unconfirmed

- **WHEN** an item is `unconfirmed` and the operator issues a new intent
  (update / take / out) **THEN** the new intent's lifecycle replaces the
  `unconfirmed` state
