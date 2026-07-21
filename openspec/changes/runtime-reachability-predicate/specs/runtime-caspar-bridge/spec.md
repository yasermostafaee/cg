# runtime-caspar-bridge — delta (reachability predicate corrected, B-100)

## MODIFIED Requirements

### Requirement: On-air verbs are refused while the server is not connected

The bridge SHALL refuse the playout verbs that must reach the wire — `take`, `update`,
`out` — while **no declared server is reachable**, returning the machine-readable refusal
`{ accepted: false, errorCode: 'disconnected' }` rather than attempting the send.

The predicate SHALL be "**no declared session is REACHABLE**", NOT "no declared session is
`healthy`" and NOT "the current primary is not healthy". A session is REACHABLE when its AMCP
command axis is believed up — `healthy`, OR `degraded` (OSC-silent past the threshold but the
AMCP socket still open). The predicate SHALL reuse the caspar-client's own liveness notion
(`isLiveState`: `healthy` OR `degraded`) rather than re-deriving the state list in the bridge —
a second local copy is exactly how the predicate came to test `!== 'healthy'` and call a working
AMCP link dead.

Two distinctions are load-bearing:

- **OSC silence is not unreachability (B-100).** OSC is the CONFIRMATION channel; AMCP is the
  COMMAND channel. A command reaches CasparCG over AMCP whether or not OSC is flowing. Refusing
  every verb because confirmation is unavailable would turn a monitoring fault into a total
  playout outage — B-094's wrong-OSC-port install would go off air entirely though its AMCP link
  is perfect. Honesty under silence is preserved by the surfaces that already exist — an on-air
  row demotes to `unverified` ("WAS ON AIR", muted) the moment the primary leaves `healthy`
  (B-086), and the health surface renders `⚠ NO OSC` (B-094) — NOT by refusing the command. The
  operator is WARNED, not BLOCKED.
- **A dead primary with a live backup is reachable (B-056).** In a mirror pair whose PRIMARY's
  AMCP link is dead while the BACKUP is healthy (auto-failover off — the human-in-the-loop
  scenario), every send still lands backup-only on a real, rendering CasparCG: a graphic
  genuinely IS on air there. Refusing in that window would break the redundancy contract AND lie
  in the opposite direction (denying air that exists). The gate closes only when the command can
  reach NO server at all.

The SAME reachability predicate SHALL gate the load path's adopt-CLEAR / pre-roll-ADD pairing. A
load SHALL evaluate reachability ONCE and issue the destructive adopt-`CLEAR` only on a path where
the constructive pre-roll `CG ADD` will also be attempted — so a reachable server (`healthy` OR
`degraded`) is NEVER left cleared-and-empty (a BLACK layer on air), and with no server reachable
neither is sent (the load still rests the item at `loaded`, B-082). Evaluating the predicate twice
with an await between the CLEAR and the ADD is forbidden: a session slipping state in that gap is
what reopens the CLEAR-then-nothing window.

The refusal SHALL happen **before any intent is applied to the Reconciler**. This is the
load-bearing detail: an intent applied optimistically and only then failed is what produces a
transient — and, joined with stale OSC, a persistent — false ON AIR. A command that cannot reach
CasparCG SHALL leave the item's status exactly as it was.

The refusal SHALL NOT be a deferral. A command issued while no server is reachable SHALL NOT be
queued for later delivery: the operator's intent would be stranded (the reconnect path re-delivers
retained template HTML only — never stack intents), which recreates the same false belief one step
later. Refuse, and say so.

This mirrors the existing on-air block (a counted, reasoned `{ ok, reason }` refusal that the UI
surfaces verbatim). It introduces no AMCP verb and sends nothing to the wire.

#### Scenario: PLAY while no server is reachable is refused, not optimistically shown

- **WHEN** the operator takes an item while no declared server is reachable **THEN** the
  bridge refuses with `errorCode: 'disconnected'`, no `take` intent is recorded, the item's
  status is unchanged, and the item is never shown as playing or on air

#### Scenario: Update and out are refused the same way

- **WHEN** the operator updates or outs an item while no declared server is reachable
  **THEN** each is refused with `errorCode: 'disconnected'` and no intent is applied

#### Scenario: A degraded server (OSC-silent, AMCP up) is reachable — verbs are ACCEPTED

- **WHEN** the only declared server is `degraded` (OSC silent past the threshold while its AMCP
  socket still works) and the operator takes an item **THEN** the take is ACCEPTED and the
  `CG PLAY` reaches the wire — refusing over a working command link would deny air that a real
  CasparCG can render, and honesty is already carried by the `unverified` display and the
  `⚠ NO OSC` health surface, not by refusal

#### Scenario: A load onto a degraded server is never left black

- **WHEN** an item is loaded onto a layer of a `degraded` server that holds a resident producer
  **THEN** the adopt-`CLEAR` and the pre-roll `CG ADD` both reach the wire, paired in that order —
  the layer ends holding a live producer, never the BLACK an unpaired CLEAR (CLEAR-then-nothing)
  would leave on air

#### Scenario: A dead primary with a healthy backup is NOT refused (B-056)

- **WHEN** the primary's AMCP link is down but a declared backup is healthy **THEN** the
  verbs are still accepted and land backup-only, exactly as the redundancy strategy
  specifies — the command reaches a real, rendering server, so refusing it would deny air
  that genuinely exists

#### Scenario: A refused command is not deferred

- **WHEN** a command is refused because no server is reachable **THEN** it is NOT
  queued or replayed on reconnect — the operator is told it did not happen and must reissue
  it deliberately

#### Scenario: The gate lifts when a server is reachable again

- **WHEN** a declared session reaches `healthy` (or is `degraded` — reachable) **THEN** the verbs
  are accepted again and behave exactly as before, with no change to the producer-state rules that
  choose them
