# runtime-caspar-bridge — delta (AMCP-probed liveness, B-101)

## ADDED Requirements

### Requirement: AMCP liveness is measured on AMCP, never inferred from OSC silence

A session's liveness decision for its AMCP axis SHALL be made BY AMCP. Prolonged OSC silence
SHALL NOT, on its own, cause a session to disconnect, destroy its AMCP transport, or enter the
reconnect loop.

The doctrine behind that rule: a CasparCG session exposes two independent axes. **OSC is the
CONFIRMATION channel** — it reports what the server is rendering. **AMCP is the COMMAND
channel** — it carries what the server is told to do. A command reaches CasparCG over AMCP
whether or not OSC is flowing, so OSC silence is evidence about exactly one thing: that
confirmation is unavailable. The state it justifies is `degraded`, and `degraded` is REACHABLE
(B-100).

When OSC has been silent past the harder threshold, the session SHALL issue a **bounded AMCP
liveness probe** on the CURRENT command queue rather than concluding anything from the
silence:

- The probe SHALL be an AMCP command the peer must parse and answer — a `VERSION` at `urgent`
  priority under the handshake's own `versionTimeoutMs` bound. The handshake already trusts
  exactly this command to decide whether a link is usable; the probe SHALL NOT invent a
  parallel notion of a usable link, and SHALL NOT introduce a second definition of "the
  command axis answered" alongside the one the heartbeat already uses.
- **Answered** → the command axis is up and only confirmation is missing. The session SHALL
  remain `degraded`, SHALL KEEP its AMCP transport (no `destroy()`, no queue disposal, no
  reconnect), and SHALL re-arm the window, re-probing on that cadence for as long as OSC
  stays silent.
- **Failed** — rejected, timed out, or answered with a non-OK code → the command axis is
  genuinely unusable. The session SHALL transition to `disconnected` with a reason naming the
  probe, and SHALL release the healthy-exit wait so the existing teardown / backoff /
  reconnect loop runs.

Because the watcher is a repeating timer and the probe is asynchronous, probes SHALL NOT
overlap: at most one probe is outstanding at a time. A probe's verdict SHALL be discarded
unless it still describes the session that asked for it — still running, still `degraded`, and
still holding the command queue that was probed — so that a verdict which outlives its
reconnect cycle can never act on the next one.

The consequence is the point: **an install that never sends OSC holds ONE stable `degraded`
connection with full command capability.** That is the install B-094 diagnoses and the one
C-014 explicitly designs for ("a blind (B-094) install must still be able to play out"), and it
is what makes B-100's acceptance of on-air verbs on a `degraded` server continuously available
rather than available only between teardowns.

This SHALL NOT weaken detection of a genuinely dead link. A peer close still disconnects
immediately through the transport's own `close` signal, and the bounded probe additionally
catches the HALF-OPEN case — the peer holds the TCP socket open and stops answering, emitting
no close at all — which a close handler structurally cannot see.

#### Scenario: An OSC-silent install holds its AMCP link instead of reconnecting forever

- **WHEN** a session's OSC is never delivered while its peer answers AMCP normally, across
  several multiples of the OSC-down threshold **THEN** the session stays `degraded`, its AMCP
  transport is never destroyed, no reconnect is attempted, and the same TCP connection remains
  open throughout

#### Scenario: A failed probe disconnects, and the reconnect loop runs

- **WHEN** OSC is silent AND the AMCP peer stops answering, so the liveness probe times out
  **THEN** the session transitions to `disconnected` with a reason naming the probe failure,
  and the existing teardown / backoff / reconnect loop runs — the escalation was re-pointed at
  AMCP evidence, not removed

#### Scenario: A half-open link is caught by the probe, not by a close

- **WHEN** the peer holds the TCP socket open but answers nothing, so no close is ever emitted
  **THEN** the bounded probe still fails and the session disconnects — the case a close handler
  alone can never detect

#### Scenario: A peer answering with an error code fails the probe

- **WHEN** the peer answers the liveness probe with a non-OK response code **THEN** the probe
  counts as failed, for the same reason the handshake rejects a non-OK `VERSION`: a peer that
  errors on `VERSION` is not serving commands

#### Scenario: OSC returning while degraded still restores healthy

- **WHEN** OSC resumes while the session is `degraded`, after one or more probes have been
  answered **THEN** the session returns to `healthy` with its transport untouched and no
  reconnect having occurred — the prober leaves the recovery path exactly as it was

#### Scenario: A genuine peer close still disconnects immediately

- **WHEN** the AMCP peer closes the connection, whether the session is `healthy` or `degraded`
  **THEN** the session disconnects at once on the close itself, without waiting for a probe
  window

## MODIFIED Requirements

### Requirement: ON AIR is honest across a CasparCG link-loss

The stack MUST NOT keep asserting a confident **ON AIR** for an item once the CasparCG link
that would confirm it is down. The trigger is the CURRENT-PRIMARY CasparCG session **leaving
`healthy`** — full stop, whatever the cause. Confirmation flows only while a session is
`healthy`, so leaving `healthy` is precisely the condition under which an ON AIR claim stops
being confirmable. The trigger SHALL NOT be stated as a list of destination states or as any
particular mechanism: which states or faults can follow `healthy` is an implementation detail
that changes (B-101 removed OSC silence's path to `disconnected` entirely), and a
mechanism-named trigger goes stale the moment it does.

This is DELIBERATELY a different condition from the on-air **refusal**, which asks whether a
command can still REACH a server (`#noServerReachable()` — B-100). The two diverge on a
`degraded` server, and that divergence is correct: OSC silence is enough to stop CLAIMING a
graphic is on air, and NOT enough to stop COMMANDING one. This requirement SHALL NOT name the
refusal's predicate as its own, which would assert an equivalence that does not hold.

On leaving `healthy`, every stack item whose reconciled status is on-air (`on-air`, or the
`playing` fallback floor that renders identically) SHALL be re-published in an **UNVERIFIABLE**
state — a dedicated `unverified` status, distinct from both an ON AIR claim and a forced IDLE.
It SHALL render muted (never the broadcast red, never the amber of `unconfirmed`) with an
operator label conveying "was on air, cannot confirm now" and the last-known reading preserved
in the tooltip.

This re-publish SHALL be driven by the session-state transition, because the Reconciler is
event-driven and OSC silence alone emits nothing: leaving `healthy` MUST cause the affected
items to be re-published, not left frozen on their last on-air value.

On **reconnect** (the session returning to `healthy`, after its mandatory RESYNCING OSC drain)
the stack SHALL reconcile each still-unverifiable item against what CasparCG actually reports
on its layer:

- A layer whose producer is still present re-announces it over the resumed continuous OSC
  within ~one tick; the Reconciler's fresh-OSC truth SHALL restore that item to **ON AIR**
  automatically.
- A layer that stays silent past the occupancy staleness bound (the producer is gone — e.g.
  CasparCG restarted with empty layers) SHALL reset that item to **IDLE**. Because real
  CasparCG reports no explicit "empty", this reset is inferred from the absence of a fresh
  occupancy observation for the item's slot, consistent with the orphan sweep's "absence of
  knowledge is not knowledge of absence".

The on-air **refusal** is unchanged by this requirement: while **no declared server is
reachable** (`#noServerReachable()`), `take` / `update` / `out` remain refused (R-006). This
requirement changes only the honesty of the reconciled on-air **display and truth**, never what
a command does. Death-vs-blip is not guessed — an item stays unverifiable until OSC resolves it
on reconnect.

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

#### Scenario: The on-air refusal is unchanged while no server is reachable

- **WHEN** no declared server is reachable and the operator issues `take` / `update` / `out`
  **THEN** the command is still refused (R-006), exactly as before — the unverifiable display
  changes no command outcome

#### Scenario: A degraded server shows unverified YET still accepts commands

- **WHEN** the primary is `degraded` (OSC-silent, AMCP up) with an item on air **THEN** that
  item displays as `unverified` because its claim cannot be confirmed, AND `take` / `update` /
  `out` are still ACCEPTED because the command link is working — the display condition and the
  refusal condition are deliberately different

#### Scenario: Distinct from the item-scoped ack-timeout

- **WHEN** a single command's AMCP ack times out on an otherwise-live link **THEN** that item still
  settles to the existing amber `unconfirmed` (B-044), NOT to `unverified` — the two are different
  conditions (one item vs the whole link)
