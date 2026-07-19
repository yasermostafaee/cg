# Tasks — the blind occupancy tap (B-093)

## 1. Recon (done)

- [x] 1.1 Reproduced on real hardware in PR #353's probe: with the bridge's OSC ingest on a port
      CasparCG never sends to, `restore()` emitted
      `CG 1-45 ADD 0 "…" 0 "{}"` over a live producer. Captured on the wire, not inferred.
- [x] 1.2 With OSC healthy the same restore sent NOTHING and left the producer untouched — the
      occupied branch is correct and must stay untouched.
- [x] 1.3 `note()` filters to producer events, and a healthy-but-idle CasparCG emits NO per-layer
      producer messages (2.3.2: only `/channel/N/framerate`, `/channel/N/mixer/…`). So the flag
      must key on TRAFFIC, or healthy-idle becomes indistinguishable from blind and the
      legitimate empty-layer re-ADD path breaks.
- [x] 1.4 `ServerSession` degrades out of `healthy` on OSC silence, so a blind install FLAPS and
      the tap resets each cycle — the refusal must therefore be re-evaluated per cycle, not once.

## 2. The evidence distinction

- [x] 2.1 `OscOccupancyTap`: `hasReceivedOsc` + `noteTraffic()`, cleared in `reset()` so a
      reconnect cannot inherit a stale `true`.
- [x] 2.2 `OscTransport`: call `noteTraffic()` once per PARSED packet, before `messageToEvent`
      filtering — packet-level on purpose (1.3).

## 3. The refusal

- [x] 3.1 `#decidePendingRestores(occupiedKeys, tapHasReceivedOsc)`: when never heard, send
      nothing, mark the items unverifiable, and LEAVE them pending.
- [x] 3.2 Skip `reconcileOnReconnect` while the tap is blind — the same bug lived there and would
      reset a live item to `idle` over a healthy link.
- [x] 3.3 `#sweepOccupancy` retries the pending decision once the tap has heard OSC, so a
      late-arriving tap cannot strand rows permanently.
- [x] 3.4 One stderr diagnostic at the refusal naming what was not done, why, and the fix.
- [x] 3.5 Replace the superseded comment that argued a wrong "silent" verdict was acceptable —
      hardware disproved it, and leaving that reasoning in place would invite the bug back.

## 4. The honest surface

- [x] 4.1 `Reconciler`: per-item `unverifiable` flag + `setUnverifiable()`, demoted to
      `unverified` beside the global `linkDown` rule. Per-item because the LINK IS UP here, so a
      global demotion would misreport every other row.
- [x] 4.2 Cleared on any fresh operator intent, and when the decision is finally made — the state
      can never outlive the doubt that caused it.
- [x] 4.3 `StatusBadge` gains `oscBlind`: reads `◌ ON AIR?` with a tooltip naming OSC and the real
      fix. Same status, same muted tone, different words (see the runtime-ui delta for why
      reusing the link-loss wording would mislead twice).
- [x] 4.4 `StackRow` derives `oscBlind` from state it already has — `unverified` + bridge link UP + primary healthy can only be this case. No new IPC.

## 4b. Holes closed by adversarial review (all reproduced before fixing)

- [x] 4b.1 STICKY vs TIME-WINDOWED. A one-shot "ever heard" bit went permanently true on a
      single packet while `occupied()` kept ageing out — so a tap that heard OSC once and then
      went deaf reported "heard" forever and every layer empty, re-arming the exact
      re-ADD-over-a-live-producer this fixes. Replaced with `hasFreshOsc(staleMs)` on the SAME
      window `occupied()` uses, so both signals decay together.
- [x] 4b.2 FOREIGN SOURCE. `noteTraffic()` accepted OSC from any address, and the ingest binds a
      routable interface for a remote server — so a second CasparCG pointed at this port
      permanently satisfied the gate while the real primary was firewalled. Now only the declared
      server's address counts, and the TRUST signal only: `note()`, `occupied()`, the R-009 sweep
      and B-086's reconcile are untouched.
- [x] 4b.3 STALE PARKED RESTORE. The refusal made a pending entry able to OUTLIVE a decision pass
      for the first time; only `remove()` retired one, so a later decision could replay the
      restore-time template/fields/slot over an item the operator had since taken or edited. Every
      operator verb now retires the parked restore.
- [x] 4b.4 CONFIDENT RED WHILE BLIND. Skipping `reconcileOnReconnect` protects a live item from a
      false `idle`, but `setLinkDown(false)` had just cleared the demotion covering every played
      item — leaving non-restored items on a red ON AIR nothing could back, beside a green pill.
      While blind, every played item is now marked unverifiable.

## 5. Tests (assert the WIRE, not the badge)

- [x] 5.1 Blind tap + live layer → NOTHING sent (no `CG ADD`, no `CLEAR`, no bare `CLEAR`), the
      producer stays on air, and the row publishes `unverified`. The regression this exists for.
- [x] 5.2 Heard tap + occupied → adopt, nothing sent (unchanged).
- [x] 5.3 Heard tap + silent → re-ADD as loaded (unchanged).
- [x] 5.4 Recovery: a blind refusal is decided by the sweep once OSC arrives.
- [x] 5.5 Tap unit tests: starts blind; traffic flips it with no producer events; `reset()` clears
      it so a reconnect cannot inherit `true`.
- [x] 5.6 Badge wording: blind-tap reads as a question and never says "reconnect"; link-loss
      wording unchanged; both share one muted tone.
- [x] 5.7 Mutation-checked: neutering the refusal turns 5.1 red on the `CG ADD` assertion.
- [x] 5.8 caspar-bridge green isolated AND under full parallel `pnpm test`; ports/sockets released
      in `afterEach`.
- [x] 5.9 Freshness decay: a tap that heard once and went deaf stops vouching (4b.1).
- [x] 5.10 Foreign-source OSC does not satisfy the gate; the declared host's does (4b.2).
- [x] 5.11 An operator action retires a parked restore, so a later decision cannot replay it (4b.3).
- [x] 5.12 While blind, a NON-restored played item is demoted too — never red, never a false idle
      (4b.4).

## 6. Gate

- [x] 6.1 `pnpm gate` green (uncached).
- [x] 6.2 `pnpm gate:e2e` with no dev server / mock / bridge competing for CPU.
- [x] 6.3 `pnpm openspec validate runtime-blind-occupancy-tap --strict`.
