# runtime-caspar-bridge (B-044 — pending-intent completion)

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

#### Scenario: Real OSC drives stack state

- **WHEN** the server emits OSC (a layer's `foreground/producer` flips to
  `html` / `empty`) **THEN** the affected item's reconciled status updates from
  that real confirmation (e.g. `on-air` when the producer is live, `idle` when it
  empties), routed via the `LayerManager`-driven interest set — and raw OSC does
  not cross the WebSocket

#### Scenario: Outbound deltas are coalesced, not unbounded-queued

- **WHEN** OSC churns faster than the UI needs **THEN** the bridge coalesces
  pending `StackItemState` changes per `itemId` (last-write-wins) into bounded
  snapshot publishes rather than queuing every intermediate state

## ADDED Requirements

### Requirement: Transient stack intents complete on ack or expire

The `updating` and `exiting` stack-item statuses SHALL be **transient**: they
SHALL NEVER be a permanent resting state. The Reconciler SHALL settle a
transient intent when the AMCP ack of the intent's own command arrives — the
`CG UPDATE` line for an update; the single `CLEAR` the bridge emits for an out:

- An OK ack SHALL settle the item to its underlying state — the pre-update
  status (normally `playing`) for an update; `idle` for an out. The ack means
  **accepted by CasparCG**; it is not proof the template applied the value
  (B-041's `202`-plus-template-failure history) — deeper applied-verification
  is out of scope of this requirement.
- A failure ack SHALL surface the existing `error` state with its `errorCode`.
- An ack for a superseded intent (an older sequence than the item's latest)
  SHALL NOT mutate the item's state.

If no ack arrives within a bounded time (5 s), the bridge SHALL expire the
intent to an explicit **`unconfirmed`** status (with an `errorCode`), surfaced
to the operator UI — never a silent revert to the prior status, never a fake
success, never an indefinite `updating`/`exiting`. A late OK ack after expiry
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

#### Scenario: A subsequent intent clears unconfirmed

- **WHEN** an item is `unconfirmed` and the operator issues a new intent
  (update / take / out) **THEN** the new intent's lifecycle replaces the
  `unconfirmed` state
