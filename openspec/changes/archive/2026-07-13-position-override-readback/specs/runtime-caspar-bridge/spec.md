# runtime-caspar-bridge (B-072 — the stored position override is readable)

## ADDED Requirements

### Requirement: The stored position override is published in item state

`StackItemState` SHALL carry an OPTIONAL `position: Position`. Absent means the
item has NO operator override (the consumer falls back to the template's
manifest default) — every item-state producer and consumer that predates the
field SHALL validate and behave unchanged.

The bridge SHALL publish each item's stored override on the item-state stream
that already exists — BOTH `stack.snapshot` and `stack.state-changed` — by
joining its per-item override store into the state at the point of publication.
Ownership SHALL NOT move: the Reconciler remains the sole owner of reconciled
item state (acks and OSC), the position override remains operator UI state
owned by the runtime, and the two are joined only where state is published to
the renderer. Internal consumers of the reconciled snapshot are unaffected.

Because a removed item's override is already dropped (R-011: "the override dies
with the item"), a removed item's published state SHALL carry no `position` —
the read-back inherits delete-on-remove rather than re-implementing it.

This requirement adds a READ path only. It changes no write, no AMCP command,
and no wire payload: `stack.set-position`'s refusal predicate, the served-URL
query contract, and the AMCP escape rule are all untouched.

#### Scenario: A set position is readable in the published state

- **WHEN** the operator sets a position on an item **THEN** that item's state
  on BOTH `stack.snapshot` and `stack.state-changed` carries `position` equal
  to the override that was set

#### Scenario: The override survives re-reads

- **WHEN** the published state is re-read later (the operator deselects and
  reselects the item; no intervening command) **THEN** the item's `position` is
  still the override — the read is idempotent, not consumed

#### Scenario: An item with no override publishes no position

- **WHEN** an item that has never been given an override is published **THEN**
  its state carries NO `position`, and a consumer falls back to the manifest
  default

#### Scenario: Removal clears the published override

- **WHEN** an item with a stored override is removed **THEN** the override is
  dropped and no subsequent published state for that item id carries a
  `position` — a re-used item id starts clean
