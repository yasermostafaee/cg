# Say when the server is answering but inaudible (B-094)

## Why

A CasparCG can answer AMCP perfectly — acking every command, rendering every graphic — while none
of its OSC reaches the bridge. The owner hit exactly that: the OSC `predefined-client` pointed at
port 5253 instead of 6250, plus a literal `false [true|false]` left inline in
`<disable-send-to-amcp-clients>`.

Nothing in the UI pointed at it, and the two things it _did_ say were both wrong in the same
direction:

- The health pill read a confident green **PRIMARY A HEALTHY**, because `HEALTHY` is derived from
  the AMCP axis alone.
- When `ServerSession` finally noticed the silence it degraded and then force-disconnected, so the
  pill read **DEGRADED / OFFLINE** — which every operator reads as "CasparCG is down". The truth is
  the opposite: the server is up and rendering, and its OSC configuration is wrong.

That is **mis-warning, not un-warning**, and it is the more expensive failure: the remedy it
implies — restart the playout box — is the one that takes air down. The install also FLAPS
(healthy → degraded → reconnect), so the bar is reassuringly green for part of every cycle and
mis-attributed for the rest.

Silently degraded meanwhile: on-air confirmation, [[B-086]]'s reconnect reconcile, R-009's orphan
detection, and [[B-092]]/[[B-093]]'s stack restore — which now correctly refuses to decide, but had
no way to say why.

## What Changes

- **The bridge publishes when each server was last heard on OSC** (`oscFreshAt`), from the SAME
  source-filtered signal [[B-093]] added — not a second, divergent source of truth that could
  disagree with the restore guard. The `ServerHealthSchema` slot already existed and was unused, so
  there is **no schema change** and no new channel.
- **Health re-publishes when that bit flips**, on the sweep tick that already runs. Health is
  otherwise emitted only on adapter / failover / setConfig events, so without this the indicator
  would appear or clear only when something unrelated happened to change.
- **The StatusBar renders `⚠ NO OSC`** beside the health pill when the server is answering AMCP and
  nothing has ever been heard from it. Amber — the repo's caution tone — deliberately **not** the
  red reserved for air claims and for a server that is genuinely down.
- **The tooltip names the fault and the remedy, in that order**: that the server is UP, that this is
  an OSC _configuration_ problem on the CasparCG side rather than a connection failure, what is
  degraded while it persists (on-air confirmation, orphan detection, stack restore), and the fix
  (`<osc><predefined-clients>` / the UDP port). The one thing it must never imply is "restart the
  server".

## A separate indicator, not a pill state

The pill's vocabulary — `disconnected / connecting / handshaking / resyncing / healthy / degraded` —
mirrors the session state machine exactly. "Answering AMCP but inaudible" is an **orthogonal axis**,
not another state on that machine, and forcing it into the same slot is precisely the conflation
that causes the mis-attribution.

Keeping them separate lets the bar state both facts at once — `PRIMARY A HEALTHY  ⚠ NO OSC` reads
as "it is up, but I am deaf to it", which is the truth. Decisively, it also survives the flap: as
the pill oscillates HEALTHY↔DEGRADED the indicator stays put and explains **both**, where a pill
state would be overwritten by DEGRADED at exactly the moment the operator is most likely to go and
restart the server.

It follows the bar's existing grammar, where orthogonal facts already get their own pills —
`○ NO BACKUP`, the strategy pill, and `⚠ NO SERVER — SIMULATED`.

## What suppresses it

- **Bridge disconnected** — everything is unreadable then; the pills already say UNKNOWN and the
  link indicator says DISCONNECTED. A second, unobservable alarm would only mis-attribute again.
- **Test mode** — there is no server to be deaf to.
- **Connecting / handshaking / resyncing** — a cold start has legitimately heard nothing yet, so the
  indicator waits for the session to get past its handshake before treating silence as meaningful.
- **An idle-but-healthy server does NOT trigger it.** Verified on real CasparCG 2.3.2: a channel
  whose layers are all empty emits no per-layer producer messages, only channel-level ones. The
  signal is keyed on OSC traffic for exactly this reason — a producer-derived one would cry wolf on
  every install between shows.

## Frozen

An indicator only: it changes no decision, gate or command path. On-air refusal (R-006),
[[B-086]]/[[B-087]]'s `unverified` badge, [[B-092]]'s restore and [[B-093]]'s blind-tap guard are
untouched.

## Impact

- **Affected specs:** `runtime-ui`.
- **Affected code:** `tools/caspar-bridge` (`health()` snapshot + the sweep re-publish),
  `apps/runtime` (`StatusBar`). No schema, channel or package-contract change.
