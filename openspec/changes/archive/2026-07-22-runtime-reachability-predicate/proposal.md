# Correct the bridge's reachability predicate: a degraded server is REACHABLE (B-100)

## Why

The bridge's link predicate `#linkDown()` tested `state !== 'healthy'`, but its own doc comment
and the spec's intent both say "no declared server is **reachable**". Those diverged the moment a
server went `degraded` — OSC-silent past the 3 s threshold while its AMCP socket still works. OSC
is the CONFIRMATION channel; AMCP is the COMMAND channel. A `degraded` server still executes
commands; only its confirmation is missing. Testing `!== 'healthy'` called that working AMCP link
DEAD.

Two harms followed, both on air:

- **A black layer.** `load()` issues an adopt-`CLEAR` (to destroy any producer a previous bridge
  session orphaned on the layer) and then a pre-roll `CG ADD`. Both read the predicate
  INDEPENDENTLY, with an await between them. On a `degraded` server the AMCP link is up, so the
  adopt-`CLEAR` REACHES THE WIRE and destroys the resident producer — then the predicate returned
  early and SKIPPED the `CG ADD`. CLEAR-then-nothing → the layer goes BLACK. (C-014's quarantine,
  which would otherwise protect the layer, needs a FRESH non-`html` observation — and under OSC
  silence there are none, so the protection is absent in exactly the state that triggers this.)
- **Total playout refusal.** `take` / `update` / `out` were all refused with
  `errorCode: 'disconnected'` while the only declared server was `degraded` — a monitoring fault
  turned into a full playout outage. B-094's real incident (OSC on the wrong port) would take the
  station off air entirely though its AMCP link is perfect.

The repo already holds the correct doctrine everywhere else: the caspar-client's own `isLiveState`
counts `degraded` as live; redundancy divergence gating treats `degraded` as live; C-014's
allocation deliberately fails OPEN on silence "because refusing on silence would cause total
playout outage on no-OSC installs". Only the bridge re-derived the state list locally and got it
wrong — which is why the fix reuses `isLiveState` rather than defining a third copy.

## What Changes

- **The predicate is corrected and renamed.** `#linkDown()` → `#noServerReachable()`, testing
  `sessions.every((s) => !isLiveState(s.state))`. `isLiveState` (`healthy` OR `degraded`) is
  promoted to the caspar-client's public entry so there is ONE canonical reachability notion, not
  a second local copy. The name now matches the predicate — the name lying was the root cause.
- **CLEAR/ADD pairing is made structural.** `load()` evaluates reachability ONCE and gates BOTH
  the adopt-`CLEAR` and the pre-roll `CG ADD` on that single value. A reachable server is never
  left cleared-and-empty; an unreachable one is sent neither (the load still rests at `loaded`,
  B-082). Two reads with an await between them is the window this closes.
- **On-air policy change (deliberate, owner-approved).** `take` / `update` / `out` are NO LONGER
  refused while the only declared server is `degraded` — the command reaches CasparCG over AMCP.
  Honesty under OSC silence is preserved by the surfaces that already exist (B-086 demotes on-air
  rows to `unverified`; B-094 renders `⚠ NO OSC`), not by refusal. With NO server reachable
  (disconnected / connecting / handshaking / resyncing) the verbs are STILL refused with
  `errorCode: 'disconnected'` — offline safety is re-scoped to its true condition, not removed.

## Impact

- Affected spec: `runtime-caspar-bridge` — the requirement "On-air verbs are refused while the
  server is not connected" has its predicate corrected from `!== 'healthy'` to "no declared server
  is reachable" (`isLiveState`), with new scenarios for the degraded-accepted case and the
  never-black load.
- Affected code: `tools/caspar-bridge/src/caspar-runtime.ts` (predicate + load pairing),
  `packages/caspar-client` (`isLiveState` exported from the entry point).
- Behavioural: the on-air policy change above. Frozen and verified unchanged: R-006 offline
  refusal (no server reachable), B-082 offline load-rests-at-loaded, B-056 mirror-pair sends,
  B-086 unverified display, C-014 quarantine, the AMCP verb/order/quoting seam.
- Hardware verification is OWED before archive (this changes on-air behaviour).
