# Design — AMCP-probed liveness (B-101)

## The doctrine, stated once

**Probe the axis you intend to judge.** A monitoring channel's silence may never stand in
for the liveness of a channel it does not measure. OSC silence is honest evidence about
exactly one thing — that confirmation is unavailable — and `degraded` already expresses
precisely that. Everything the old code did past that point was inference about a socket
OSC has no view of.

So the escalation is not deleted, it is **re-pointed at the right evidence**: ask AMCP.
Deleting it outright would have left the half-open case (peer holds the socket open, answers
nothing) with no detector at all, since `onAmcpClose` only fires on a real FIN/RST.

## Why `VERSION`, and why no new knob

`VERSION` is the cheapest AMCP command that proves a live command path end-to-end: the peer
parsed a line and answered it. The handshake already trusts exactly this command, at
`urgent` priority, under `versionTimeoutMs`, to decide whether a fresh link is usable — so
the probe reuses all three rather than inventing a parallel notion of "usable link".

`versionTimeoutMs` bounds the probe. A separate knob would be two names for one latency
budget against the same peer over the same socket, and the divergence between two such names
is the failure mode this whole change is about.

`oscDownAfterMs` keeps its name and its value. What changes is the CONSEQUENCE, not the
condition: it is still "how long OSC may be silent before we stop accepting the silence at
face value" — we now ask AMCP instead of concluding. It doubles as the re-probe cadence,
because "how long silence is tolerated before re-asking" is the same question. Its doc
comment says so explicitly, since the old one implied a disconnect.

## Reusing the probe rather than copying it

`HeartbeatService` already contained a `VERSION`-at-urgent-with-a-timeout prober. Writing a
second one forty lines away in `ServerSession` would be the exact pattern that produced
B-100 — two implementations of one predicate, free to drift. So the shared verdict function
`probeAmcpLiveness(queue, timeoutMs, now)` is extracted and BOTH call it. `HeartbeatService`
keeps its own policy (fixed interval, miss budget, axis events) and its observable behaviour
including its `'timeout'` / `code=NNN` reason strings; only the "did it answer?" step moves.

Note this does NOT revive `HeartbeatService` (dead wiring, C-010). Wiring it in would put
continuous `VERSION` traffic on every healthy link — a far larger change than B-101 asks
for. The session's probe fires only inside the degraded window, so a healthy link carries no
extra traffic at all.

## Two async hazards, and how they are closed

`tick` is a `setInterval`; the probe is a promise. Both hazards come from that gap.

1. **Overlap.** At a 20 ms watcher interval a 200 ms probe would be re-issued ten times.
   A `probeInFlight` flag admits one at a time, released in a `finally` so a rejection cannot
   strand it. (`HeartbeatService` guards its ping the same way — the same hazard, the same
   answer.)
2. **A verdict outliving its subject.** While a probe is in flight OSC may recover, the peer
   may close, `stop()` may run, or a teardown may rotate `currentQueue` to a fresh instance.
   `probeApplies(probedQueue)` requires the session to still be running, not stopping, still
   `degraded`, and still on the queue that was probed — the queue identity check being what
   stops a stale verdict from disconnecting the NEXT cycle's healthy socket. The probed queue
   is captured before the `await`, never re-read after it.

The second is the same shape as the rule CLAUDE.md already carries from B-100: a decision
must act on the evaluation it was made from, not on a re-read across an `await`.

## Test seam

`ServerSessionOptions` already exposes every timer plus injectable `createAmcp` / `createQueue`,
so no new seam is needed. The tests drive a real `amcp-mock` with `disableOsc: true` (the
blind install, reproduced), count the `VERSION`s the PEER saw via `setHandler`, and count the
transports the factory built — one transport for the session's whole life is what "the socket
was never destroyed" looks like from the outside. A never-resolving `VERSION` handler gives a
genuine half-open link: the mock's dispatcher awaits the handler before writing, so the socket
stays open with nothing coming back.

The bridge's `reachability-predicate.integration.test.ts` keeps its inflated `oscDownAfterMs`,
for a NEW reason recorded in its header comment: not to tune out a force-disconnect (there is
none now) but to keep probe traffic out of the wire traces it parses, and to stop a probe
timing out on a loaded CI host from disconnecting a session mid-test and reddening a suite
that is about the bridge predicate rather than about liveness.

## Rejected: a per-server "OSC expected" configuration flag

B-101's entry calls this the more honest model, and in the abstract it is — it distinguishes
"OSC was never expected" from "OSC was expected and stopped", which no timer can. It is
rejected HERE, not forever:

- It needs new configuration and new UI surface, i.e. a product decision, not a bug fix.
- The probe makes it OPTIONAL rather than required. With liveness measured on AMCP, an
  install that never sends OSC already behaves correctly with no configuration at all: one
  stable `degraded` connection, full command capability, and B-094's `⚠ NO OSC` indicator
  telling the truth about the only thing that IS wrong.

It stays available as a follow-up for the distinction above, and nothing here forecloses it.
