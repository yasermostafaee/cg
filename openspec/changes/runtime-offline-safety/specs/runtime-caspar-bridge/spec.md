# runtime-caspar-bridge Specification (delta)

## MODIFIED Requirements

### Requirement: Bridge selection at boot

`createRuntimeBridge()` SHALL be async and decide the backend **once** at startup. The
Runtime SHALL present the same UI either way and SHALL NOT crash when the bridge is absent.

An unreachable bridge SHALL NOT select the mock. When the probe (default 1500ms) is refused
or times out, the app SHALL remain on the **live** backend in an explicit, visible
**disconnected** state — reconnecting on its own, with every command rejected and never
routed to a simulation. A silent fallback is forbidden: it pins the whole session to an
in-memory simulation that reports success for commands that reach nothing, which is how an
operator comes to believe a graphic is on air when none is.

The in-memory mock SHALL be selected **only** on an explicit request (an operator-chosen
test mode, or a test harness arming the flag) — never as an automatic consequence of the
bridge being absent, and never mid-session.

#### Scenario: Bridge reachable

- **WHEN** the bridge WebSocket connects within the timeout **THEN** the app uses the
  `WebSocketRuntime` and shows a "connected / live" indicator

#### Scenario: Bridge absent — disconnected, NOT the mock

- **WHEN** the probe is refused or times out **THEN** the app stays on the live backend in
  a visible DISCONNECTED state, keeps trying to reconnect, and refuses commands — it SHALL
  NOT construct the mock, SHALL NOT report any server as healthy, and SHALL NOT show any
  item as on air

#### Scenario: The mock is only ever entered on purpose

- **WHEN** the operator (or a test harness) explicitly requests test mode **THEN** — and
  only then — the app runs the in-memory mock, and says so unmistakably

## ADDED Requirements

### Requirement: On-air verbs are refused while the server is not connected

The bridge SHALL refuse the playout verbs that must reach the wire — `take`, `update`,
`out` — while **no declared server is reachable**, returning the machine-readable refusal
`{ accepted: false, errorCode: 'disconnected' }` rather than attempting the send.

The predicate SHALL be "no declared session is `healthy`", NOT "the current primary is not
healthy". In a mirror pair whose PRIMARY's AMCP link is dead while the BACKUP is healthy
(auto-failover off — B-056's human-in-the-loop scenario), every send still lands
backup-only on a real, rendering CasparCG: a graphic genuinely IS on air there. Refusing in
that window would break the redundancy contract AND lie in the opposite direction (denying
air that exists). The gate closes only when the command can reach no server at all.

The refusal SHALL happen **before any intent is applied to the Reconciler**. This is the
load-bearing detail: an intent applied optimistically and only then failed is what produces
a transient — and, joined with stale OSC, a persistent — false ON AIR. A command that
cannot reach CasparCG SHALL leave the item's status exactly as it was.

The refusal SHALL NOT be a deferral. A command issued while disconnected SHALL NOT be
queued for later delivery: the operator's intent would be stranded (the reconnect path
re-delivers retained template HTML only — never stack intents), which recreates the same
false belief one step later. Refuse, and say so.

This mirrors the existing on-air block (a counted, reasoned `{ ok, reason }` refusal that
the UI surfaces verbatim) and the orphan sweep's `session.state !== 'healthy'` gate. It
introduces no AMCP verb and sends nothing to the wire.

#### Scenario: PLAY while no server is reachable is refused, not optimistically shown

- **WHEN** the operator takes an item while no declared server is healthy **THEN** the
  bridge refuses with `errorCode: 'disconnected'`, no `take` intent is recorded, the item's
  status is unchanged, and the item is never shown as playing or on air

#### Scenario: Update and out are refused the same way

- **WHEN** the operator updates or outs an item while no declared server is healthy
  **THEN** each is refused with `errorCode: 'disconnected'` and no intent is applied

#### Scenario: A dead primary with a healthy backup is NOT refused (B-056)

- **WHEN** the primary's AMCP link is down but a declared backup is healthy **THEN** the
  verbs are still accepted and land backup-only, exactly as the redundancy strategy
  specifies — the command reaches a real, rendering server, so refusing it would deny air
  that genuinely exists

#### Scenario: A refused command is not deferred

- **WHEN** a command is refused because the server is disconnected **THEN** it is NOT
  queued or replayed on reconnect — the operator is told it did not happen and must reissue
  it deliberately

#### Scenario: The gate lifts when the server is healthy again

- **WHEN** the primary session reaches `healthy` **THEN** the verbs are accepted again and
  behave exactly as before, with no change to the producer-state rules that choose them
