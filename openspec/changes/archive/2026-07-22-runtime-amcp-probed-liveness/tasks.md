# Tasks — AMCP-probed liveness (B-101)

## 1. One canonical liveness probe

- [x] 1.1 New `packages/caspar-client/src/session/amcp-probe.ts`: `probeAmcpLiveness(queue,
timeoutMs, now)` → `{ ok: true, roundtripMs } | { ok: false, reason }`. `VERSION` at
      `urgent` priority under a bounded timeout; a non-OK code is a failure, as in the
      handshake. Exported from the package entry.
- [x] 1.2 `HeartbeatService.tick()` delegates to it — one definition of "the AMCP command axis
      answered", not two. Its observable behaviour is unchanged, including the `'timeout'` /
      `code=NNN` miss reasons its tests assert.

## 2. The session: probe instead of infer

- [x] 2.1 `ServerSession.tick()` — the `degraded` branch no longer escalates on
      `oscDownAfterMs`. Past that window it issues the probe on the CURRENT queue.
- [x] 2.2 Answered → stay `degraded`, keep the transport, re-arm `nextProbeAt` and re-probe on
      the same cadence for as long as OSC stays silent.
- [x] 2.3 Failed → `transitionTo('disconnected', 'amcp probe failed: …')` +
      `resolveHealthyExit()`, so the existing teardown / backoff / reconnect loop runs.
- [x] 2.4 Async safety: a `probeInFlight` flag admits one probe at a time (released in
      `finally`), and `probeApplies(probedQueue)` discards a verdict unless the session is
      still running, not stopping, still `degraded`, and still on the queue that was probed.
      The queue is captured BEFORE the `await` and never re-read after it.
- [x] 2.5 Doc comments corrected where they now lie: `oscDownAfterMs` (a probe window, not a
      disconnect), `versionTimeoutMs` (also bounds the probe), and the class's OSC-watcher and
      out-of-scope notes.

## 3. Tests (red-first where they are repros)

- [x] 3.1 New `packages/caspar-client/tests/amcp-probed-liveness.test.ts`, against the real
      `amcp-mock` with `disableOsc` — the blind install reproduced.
- [x] 3.2 RED-FIRST, the regression B-101's entry names: OSC never delivered, AMCP answering
      normally → across 3+ probe windows the session stays `degraded`, the transport is never
      destroyed or rotated, `amcpClientCount` stays 1, and no reconnect is attempted. Shown red:
      `expected 'resyncing' to be 'degraded'` — caught mid-reconnect.
- [x] 3.3 RED-FIRST, the safety net: OSC silent AND the peer mute → `disconnected` with an
      `amcp probe` reason, then a real reconnect. Shown red: `expected 'osc down > 120ms' to
match /amcp probe/`.
- [x] 3.4 Half-open: peer holds the socket open and answers nothing → the probe disconnects
      while the transport emits NO close, so `onAmcpClose` provably did not do it. Expressible
      in the mock: its dispatcher awaits the handler before writing, so a never-resolving
      `VERSION` handler is a genuine half-open link.
- [x] 3.5 A non-OK `VERSION` code fails the probe (`amcp probe failed: code=500`).
- [x] 3.6 No overlapping probes when a probe outlasts the watcher interval (200 ms probe, 10 ms
      tick, 40 ms window → a handful of probes, not one per tick).
- [x] 3.7 Recovery: OSC returning while degraded still restores `healthy` after a probe has
      answered, with the transport untouched and no reconnect. NOT a frozen guard — pre-fix the
      session cannot reach this state at all.
- [x] 3.8 FROZEN, verified unchanged: a genuine AMCP peer close still disconnects immediately,
      from `healthy` and from `degraded`, with reason `amcp peer closed`. Both passed pre-fix
      and post-fix. The `healthy → degraded` demote and the `degraded → healthy` recovery stay
      covered by `server-session.test.ts`, untouched and passing.
- [x] 3.9 `tools/caspar-bridge/tests/reachability-predicate.integration.test.ts` re-read and
      still passing. `DEGRADED_TUNING` KEPT, comments corrected: the inflated `oscDownAfterMs`
      no longer tunes out a force-disconnect (there is none) — it keeps probe traffic out of the
      wire traces these tests parse and stops a probe timing out on a loaded CI host from
      reddening a suite that is about the bridge predicate, not liveness.

## 4. Spec

- [x] 4.1 ADDED requirement: AMCP liveness is measured on AMCP, never inferred from OSC silence.
- [x] 4.2 MODIFIED `ON AIR is honest across a CasparCG link-loss` — three stale spots repaired:
      the `#linkDown()` parenthetical and its false "same condition" claim (now
      mechanism-agnostic: the trigger is LEAVING `healthy`, and the divergence from the refusal
      is stated as deliberate); "while the link is down" → "while no declared server is
      reachable" (`#noServerReachable()`); and the scenario heading and body that said the same.
      Plus a scenario pinning the divergence itself.
- [x] 4.3 Shared-spec ordering with the still-open `runtime-reachability-predicate` delta
      verified — see §7.

## 5. Docs

- [x] 5.1 `docs/prd/bugs-runtime.md`: B-101 → `[~]`, with a Notes line recording the REJECTED
      per-server "OSC expected" flag and why, so it is not re-litigated.
- [x] 5.2 The consolidated hardware session below cross-linked from B-101, B-100 and B-082.
- [x] 5.3 `CLAUDE.md`: one standing rule — probe the axis you intend to judge.

## 6. ONE consolidated hardware session (DISCHARGED 2026-07-22 — every check PASSED)

Owner-verified on real CasparCG hardware on 2026-07-22, in ONE session as designed. It
discharged B-101, B-100, B-082 check #1, and both C-014 on-air validations; every box below
passed. Do NOT book a second trip for any of them.

Steps 6.2.1–6.2.5 are B-100's and B-082's on-air walk. Every one of them must be performed
while the server is still `degraded`; if it recovers to `healthy` mid-walk the run proves
nothing and must be restarted from 6.1.

- [x] 6.1 **Setup.** Drive one declared server to `degraded`: stop OSC (or point it at a port
      nobody listens on) while leaving the AMCP socket up. Confirm the health surface reads
      `⚠ NO OSC` / not-healthy before starting. Put a graphic on the target layer first, so the
      adopt-`CLEAR` has a real resident producer to destroy.
- [x] 6.2.1 **Load** onto that occupied layer → the layer is **NOT black** (the adopt-CLEAR is
      paired with the pre-roll ADD).
- [x] 6.2.2 **Take** → the graphic **plays**.
- [x] 6.2.3 **Update** → the on-air fields **change** on the rendered output.
- [x] 6.2.4 **stopItem** (graceful) → the template runs its **outro** and the producer stays
      resident. **This is the check that matters most** — it is the one whose refusal used to
      strand a graphic on air.
- [x] 6.2.5 **out** (hard clear) → the layer **clears**.
- [x] 6.3 **B-101 — the link must HOLD.** With OSC still stopped, watch the same server for
      several minutes: no HEALTHY↔DEGRADED oscillation, no reconnect churn, and every step in
      6.2 must work **first time** rather than needing a retry inside a reconnect window. Before
      this change the session force-disconnected roughly every 13 s, so a retry-free 6.2 IS the
      observable.
- [x] 6.4 **C-014 #1 — the deallocate release path.** CLEAR a foreign layer, let the tap age the
      observation out, then re-Add → the layer must return to the allocatable pool
      (`LayerManager.deallocate()`).
- [x] 6.5 **C-014 #2 — foreign-producer survival.** With an item on a layer, kill the bridge,
      PLAY a foreign producer onto that layer, restart the bridge → the item must land ELSEWHERE
      and the foreign producer must survive.

## 7. Gate

- [x] 7.1 `pnpm openspec validate runtime-amcp-probed-liveness --strict` and
      `pnpm openspec validate --all --strict`.
- [x] 7.2 `pnpm gate` green UNCACHED; `@cg/caspar-client` and `@cg/caspar-bridge` green both
      isolated and under the full parallel run.
- [x] 7.3 `gate:e2e` NOT owed — no path in this change matches `UI_RENDER_PATTERNS`
      (`tools/gate-hook/src/gate-decision.mjs`); the diff is caspar-client internals, one bridge
      test comment, specs and PRD docs.
- [x] 7.4 **Shared-spec ordering with `runtime-reachability-predicate`.** Both deltas target
      `runtime-caspar-bridge`. No requirement heading is owned by both: that change MODIFIES
      only `On-air verbs are refused while the server is not connected`; this one ADDS
      `AMCP liveness is measured on AMCP, never inferred from OSC silence` and MODIFIES only
      `ON AIR is honest across a CasparCG link-loss`. Archiving is a per-heading fold, so either
      order lands cleanly and neither change's text is dropped or duplicated. Order-dependent
      only in prose: this delta names `#noServerReachable()`, which is already the code on
      `main` (B-100's code merged; only its archive is pending), so the reference is accurate
      whichever archives first — if this one lands first, the OTHER requirement keeps its stale
      "no declared session is `healthy`" wording until B-100's archive replaces it, which is
      exactly what that pending archive is for.
