## ADDED Requirements

### Requirement: A fresh take SHALL air everything or nothing

A take SHALL stop at the first plate whose `PLAY` is refused, SHALL NOT try the plates after it, and
SHALL NOT send the graphic's `CG PLAY`. It SHALL then take back exactly what it put there, through the
one clean-up rule: the plates it seated, and the graphic it added with `CG ADD`, removed from its
layer the way `out()` removes it. When the graphic's own `CG PLAY` is refused after its plates were
seated, the take SHALL be undone the same way. A take whose plates are all accepted SHALL send the
same AMCP, in the same order, as before this requirement. A refused preset — a seat only a look not on
screen uses — SHALL NOT refuse the take.

#### Scenario: The first plate is refused on a fresh take

- **WHEN** a fresh take of a two-plate row reaches `PLAY 2-60 DECKLINK DEVICE 1` and the server
  answers `403 PLAY FAILED`
- **THEN** no `CG PLAY` is sent, `PLAY 2-61` is never sent, no `CLEAR 2-60` is sent (the server left
  that layer as it was), `CLEAR 2-59` removes the graphic the take added, and nothing of the take is
  left on 2-59 or 2-60

#### Scenario: A later plate is refused after an earlier one was seated

- **WHEN** plate 1's `PLAY` landed and plate 2's `PLAY` is refused
- **THEN** plate 1's layer is cleared with its mixer, because this take seated it; plate 2's layer is
  not cleared; the graphic the take added is removed; and no `CG PLAY` is sent

#### Scenario: The graphic's own CG PLAY is refused after its plates were seated

- **WHEN** every plate landed and the graphic's `CG PLAY` is refused
- **THEN** every plate this take seated comes down and the graphic it added comes off its layer

#### Scenario: A take whose plates are all accepted is unchanged

- **WHEN** every plate's `PLAY` and every line after it is accepted
- **THEN** the take sends the thirteen lines recorded before this requirement, in the same order

### Requirement: After a refusal the bridge SHALL clear only a layer the refused operation put a producer on

The bridge SHALL decide every clean-up that follows a refused operation by one rule — a take's
rollback, a dropped preset, the teardown of a live or switch reconcile's failed plate, and the graphic
a refused take added: a layer SHALL be cleared only if the operation put a producer on it (its `PLAY`
was acknowledged, or no usable reply came), and SHALL NEVER be cleared if a producer of ours was on it
before the operation began. A `PLAY` answered with a 4xx code SHALL be read as having put nothing on
the layer.

#### Scenario: An R-048 swap whose PLAY is refused leaves the working picture

- **WHEN** an on-air plate is pointed at another source and the replacing `PLAY` is refused
- **THEN** no `CLEAR` and no `MIXER … CLEAR` is sent for that layer, the old producer stays on air,
  and the ledger still names it

#### Scenario: A refusal on a layer the same operation seated is cleared

- **WHEN** a swap seats its new producer on a fresh layer and the line after that `PLAY` is refused
- **THEN** that layer is cleared with its mixer, and no layer the operation did not seat is touched

### Requirement: A refused take SHALL be carried on its row

When a take is refused, the bridge SHALL record on the row, and publish with it, the refusal's code,
the refused command with its payload elided, and — when a plate was refused — that plate and the
catalog entry it resolved to (its id and its name). While the refusal stands the row SHALL publish the
`error` status unless its reconciled status claims or may claim air. The refusal SHALL be withdrawn by
the row's next take that lands, by clearing the row, and by removing it.

#### Scenario: The row names the plate that was refused

- **WHEN** Bed 59's take is refused on plate `l1`, assigned to `studio1`
- **THEN** the row publishes `status: error` and `takeRefusal` with `code: amcp-403`,
  `command: PLAY 2-60 DECKLINK DEVICE 1`, `plateId: l1`, `sourceId`, and `sourceName: studio1`

#### Scenario: The next take that lands withdraws it

- **WHEN** the same row is taken again and every command is accepted
- **THEN** the row publishes no `takeRefusal`

### Requirement: The bridge SHALL refuse a take of a row that is on air or whose previous take is unresolved

The bridge SHALL refuse a take, sending nothing to CasparCG, while the row is on air or unsettled
(`isOnAirStatus`: on air, playing, updating, exiting, `unconfirmed`, or a command still pending) or
while the ledger holds its live seats — the one predicate `#ownsLiveSeats` — and SHALL answer the
code `already-on-air`. The refusal SHALL be the same for every console. A changed look, changed fields
and a dead input SHALL keep their own doors (the look picker, UPDATE, the `R-048` swap).

#### Scenario: A second console gets the same refusal

- **WHEN** a row is on air and a second console, and then the first, send `stack.take` for it
- **THEN** both are answered `accepted: false`, `already-on-air`, no AMCP line is written, and the
  graphic on air is unchanged

#### Scenario: After the row is taken out, a take works

- **WHEN** the same row is taken out and then taken again
- **THEN** the take is accepted and its `CG PLAY` is sent

#### Scenario: A take while the previous take is unresolved is refused

- **WHEN** a take's reply is later than the bound and the row reads `unconfirmed`
- **THEN** another take of that row is refused with nothing sent

## MODIFIED Requirements

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
bounded timer.** An expired TAKE is UNRESOLVED, not failed: it SHALL keep its play evidence, SHALL
read `unconfirmed` whatever OSC reports about its layer, and SHALL be settled by its own late ack —
on air if it landed, its prior evidence given back if it failed. A late OK ack after expiry SHALL
settle the item honestly. Any subsequent operator intent SHALL overwrite an `unconfirmed` state.

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

#### Scenario: A take whose reply is overdue reads unconfirmed until the reply resolves it

- **WHEN** the bridge sends a `CG PLAY` and no ack arrives within the bound **THEN** the
  item reads `unconfirmed` — never `loaded` off its page's own producer — and keeps its play
  evidence; **AND WHEN** the reply then arrives OK **THEN** the item reads on air; **AND WHEN** it
  arrives as a failure **THEN** the take's play evidence is given back

#### Scenario: A subsequent intent clears unconfirmed

- **WHEN** an item is `unconfirmed` and the operator issues a new intent
  (update / take / out) **THEN** the new intent's lifecycle replaces the
  `unconfirmed` state
