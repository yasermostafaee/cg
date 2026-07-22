# Measure AMCP liveness on AMCP, not on OSC silence (B-101)

## Why

`ServerSession`'s OSC freshness watcher escalated: after `oscDegradedAfterMs` of silence
it demoted `healthy → degraded` (correct), and after a further `oscDownAfterMs` it called
`transitionTo('disconnected', 'osc down > …ms')`. The reconnect loop then ran
`currentQueue.dispose(); currentAmcp.destroy();` — **destroying a perfectly working TCP
socket** and rejecting every pending command, because a DIFFERENT transport had gone quiet.

OSC is the CONFIRMATION channel; AMCP is the COMMAND channel. OSC silence is not evidence
about the AMCP socket, so this is B-100's category error one layer down: B-100 was the
bridge using OSC silence to decide REACHABILITY; this is the session FSM using OSC silence
as a liveness proxy for a channel it does not measure.

The cost was not a rare window but the steady state of any install that never sends OSC —
B-094's condition, and the install C-014 explicitly designs for ("a blind (B-094) install
must still be able to play out"). Such a session cycled roughly every 13 s forever: ~3 s
`healthy`, ~10 s `degraded`, then a needless teardown plus the connect/handshake/resync
climb. B-100 had just made `degraded` accept every on-air verb; this loop is what reduced
that to **INTERMITTENT command capability rather than restored capability**, since commands
issued during the climb are correctly refused `disconnected`. There was no opt-out:
`startWatcher()` runs on every entry to `healthy` and the bridge passes no overrides, so
the 3 s / 10 s defaults are what production ran.

## What Changes

- **The escalation is REPLACED by an AMCP probe, not deleted.** When the degraded window
  passes `oscDownAfterMs` the session issues a bounded `VERSION` on the CURRENT queue at
  `urgent` priority — the same command, priority and timeout (`versionTimeoutMs`) the
  handshake already trusts to decide whether a link is usable.
  - Answered → stay `degraded`, keep the transport, re-arm the window and re-probe on that
    cadence for as long as OSC stays silent. The socket is never destroyed.
  - Rejected, timed out, or answered with a non-OK code → `transitionTo('disconnected',
'amcp probe failed: …')` + `resolveHealthyExit()`, so the existing teardown / backoff /
    reconnect loop runs — this time for a reason AMCP actually reported.
- **The probe is one shared definition.** `probeAmcpLiveness(queue, timeoutMs, now)` is the
  single place that decides "did the command axis answer?", used by BOTH the session's
  degraded-window probe and `HeartbeatService`'s ping (whose behaviour, including its
  `'timeout'` / `code=NNN` miss reasons, is unchanged). A second local copy of a liveness
  test is how a predicate comes to mean something other than its name — B-100 exactly.
- **Overlap safety.** `tick` is a `setInterval` and the probe is async, so an in-flight flag
  prevents overlapping probes, and a settled verdict is discarded unless the session is
  still running, still `degraded`, and still on the queue that was probed.
- **The half-open case is now reachable.** A peer that holds the TCP socket open but stops
  answering emits no `close`, so `onAmcpClose` structurally cannot see it. The bounded probe
  can, and does.

## Impact

- Affected spec: `runtime-caspar-bridge` — one ADDED requirement (AMCP liveness is measured
  on AMCP), plus a MODIFIED "ON AIR is honest across a CasparCG link-loss" that repairs
  three spots the B-100 fix left stale (a `#linkDown()` name that no longer exists, and two
  "while the link is down" predicates that are really "while no declared server is
  reachable").
- Affected code: `packages/caspar-client` — new `session/amcp-probe.ts`, the `tick()`
  degraded branch in `session/server-session.ts`, `session/heartbeat.ts` delegating to the
  shared probe, and the entry point export.
- Behavioural: OSC silence alone can no longer disconnect a session. An OSC-silent install
  now holds ONE stable `degraded` connection with full command capability, which is what
  C-014 and B-094 already design for, and what makes B-100's fix continuously available
  rather than available between teardowns.
- Frozen and verified unchanged: `onAmcpClose` (a genuine peer close still disconnects
  immediately), the `healthy → degraded` demote at `oscDegradedAfterMs`, the
  `degraded → healthy` recovery when OSC returns, the backoff/reconnect loop itself, and
  `HeartbeatService`'s observable behaviour.
- Hardware verification is OWED before archive, consolidated with B-100 / B-082 / C-014
  into ONE session (see `tasks.md` §6).
