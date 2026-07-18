# runtime-caspar-bridge Specification (delta)

## ADDED Requirements

### Requirement: ON AIR is honest across a CasparCG link-loss

The stack MUST NOT keep asserting a confident **ON AIR** for an item once the CasparCG link that
would confirm it is down. When the CURRENT-PRIMARY CasparCG session leaves `healthy` (AMCP TCP
close, or OSC silence demoting it to `degraded`/`disconnected` — the same condition `#linkDown()`
gates the on-air refusal on), every stack item whose reconciled status is on-air (`on-air`, or the
`playing` fallback floor that renders identically) SHALL be re-published in an **UNVERIFIABLE**
state — a dedicated `unverified` status, distinct from both an ON AIR claim and a forced IDLE. It
SHALL render muted (never the broadcast red, never the amber of `unconfirmed`) with an operator
label conveying "was on air, cannot confirm now" and the last-known reading preserved in the
tooltip.

This re-publish SHALL be driven by the session-state transition, because the Reconciler is
event-driven and OSC silence alone emits nothing: leaving `healthy` MUST cause the affected items
to be re-published, not left frozen on their last on-air value.

On **reconnect** (the session returning to `healthy`, after its mandatory RESYNCING OSC drain) the
stack SHALL reconcile each still-unverifiable item against what CasparCG actually reports on its
layer:

- A layer whose producer is still present re-announces it over the resumed continuous OSC within
  ~one tick; the Reconciler's fresh-OSC truth SHALL restore that item to **ON AIR** automatically.
- A layer that stays silent past the occupancy staleness bound (the producer is gone — e.g.
  CasparCG restarted with empty layers) SHALL reset that item to **IDLE**. Because real CasparCG
  reports no explicit "empty", this reset is inferred from the absence of a fresh occupancy
  observation for the item's slot, consistent with the orphan sweep's "absence of knowledge is not
  knowledge of absence".

The on-air **refusal** is unchanged: while the link is down, `take` / `update` / `out` remain
refused (R-006). This requirement changes only the honesty of the reconciled on-air **display and
truth**, never what a command does. Death-vs-blip is not guessed — an item stays unverifiable until
OSC resolves it on reconnect.

#### Scenario: An on-air item becomes unverifiable when the link drops

- **WHEN** an item is ON AIR and its CURRENT-PRIMARY CasparCG session leaves `healthy`
  **THEN** the item is re-published as `unverified` (muted "was on air"), not as a red ON AIR and
  not as IDLE

#### Scenario: A genuinely-on-air item restores on reconnect

- **WHEN** the link returns to `healthy` and the item's layer is still occupied (CasparCG re-announces
  the producer over resumed OSC) **THEN** the item is restored to ON AIR without operator action

#### Scenario: A vanished producer resets to idle on reconnect

- **WHEN** the link returns to `healthy` and the item's layer stays silent past the occupancy
  staleness bound (the producer is gone, e.g. CasparCG restarted) **THEN** the item is reset to IDLE

#### Scenario: The on-air refusal is unchanged while the link is down

- **WHEN** the link is down and the operator issues `take` / `update` / `out` **THEN** the command is
  still refused (R-006), exactly as before — the unverifiable display changes no command outcome

#### Scenario: Distinct from the item-scoped ack-timeout

- **WHEN** a single command's AMCP ack times out on an otherwise-live link **THEN** that item still
  settles to the existing amber `unconfirmed` (B-044), NOT to `unverified` — the two are different
  conditions (one item vs the whole link)
