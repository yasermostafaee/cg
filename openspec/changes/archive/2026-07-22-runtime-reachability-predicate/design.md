# Design — reachability predicate corrected (B-100)

## The one decision: reuse `isLiveState`, do not re-derive

The bug is a SECOND definition of "is this server reachable?" The caspar-client already owns the
canonical one — `isLiveState(state) = healthy || degraded` — used by redundancy divergence gating
and corrective resend. The bridge re-derived it as `state !== 'healthy'` and the two drifted. The
fix promotes `isLiveState` to the package's public entry and imports it, so there is exactly one
place the state list lives. A third local copy would be the same trap.

`degraded` means the OSC freshness watcher has not heard OSC past the threshold while the AMCP
socket is still open. That is a CONFIRMATION-axis fault, not a COMMAND-axis one — commands still
land. So `degraded` is reachable.

## Why the pairing must be one evaluation, not two

`load()` runs `#adoptLayer` (which issues the adopt-`CLEAR`) and then, after an `await`, decides
whether to send the pre-roll `CG ADD`. Reading the predicate at BOTH points means a session that
slips state during the await can land the CLEAR yet skip the ADD — CLEAR-then-nothing, a black
layer — even with a correct predicate. Capturing `reachable` ONCE above the adopt and threading it
into both the `#adoptLayer(slot, reachable)` CLEAR gate and the ADD gate makes the pairing
structural: if the CLEAR can reach the wire the ADD is attempted; with nothing reachable neither is
sent and the item still rests at `loaded` (B-082 unchanged — the item lands on the stack with its
slot bound and OSC interest registered; only the CLEAR is gated).

## On-air policy change, and why honesty is not lost

Correcting the predicate means `take`/`update`/`out` are accepted on a `degraded` server. This is
intended: OSC silence is a monitoring fault, and refusing commands on it turns it into a total
outage (B-094). Honesty is preserved by the display surfaces that already exist — B-086 demotes
on-air rows to `unverified` the moment the primary leaves `healthy`, and B-094 renders `⚠ NO OSC` —
so the operator is warned without being blocked. The demote-display keys on "leaves healthy" while
the refusal keys on "no server reachable"; B-100 separates the two conditions that the old
predicate conflated.

## Test seam

Driving a real `degraded` state deterministically needs the session to demote on OSC silence
without force-disconnecting mid-test. `CasparRuntime` gains a TEST-ONLY `sessionTuning`
(`oscDegradedAfterMs` / `oscDownAfterMs` / `watcherIntervalMs`) spread into each `ServerSession`;
empty in production. Combined with a `deafPort` the mock never emits to (B-094's technique), a
session reaches `healthy` over AMCP, demotes to `degraded` within a tick, and holds there. The
force-disconnect-on-continued-silence path is B-101's territory and is deliberately tuned OUT of
the way here.
