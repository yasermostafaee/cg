# Tasks — CasparCG bridge architecture (C-001)

This change is **design / docs only**. Its deliverables are the architecture,
the contract, and the phased plan. The implementation tasks (Phases 1–3) are the
**breakdown for follow-up changes** — each becomes its own OpenSpec change,
branch, and PR, integration-tested against `tools/amcp-mock`. They are listed
here (unchecked) as the plan of record; they are **not** implemented in this
change.

## 1. Design deliverables (this change)

- [x] ADR 0008 — "Thick CasparCG bridge (smart proxy), not a thin byte-relay"
      (`docs/adrs/0008-thick-caspar-bridge.md`).
- [x] ADR 0007 — strike the thin-bridge sentence; add the reversal pointer to
      ADR 0008.
- [x] `design.md` — topology, thick-vs-thin rationale + reversal, the
      `@cg/shared-ipc`-over-WebSocket wire (framing), OSC tamed in-bridge, browser
      `WebSocketRuntime` + selection + offline fallback, bridge packaging, the
      ADR 0006 command-construction seam, lifecycle/failure modes, testing,
      phased plan, risks.
- [x] `specs/runtime-caspar-bridge/spec.md` — the architecture as ADDED
      requirements; C-001's four Acceptance lines mapped to scenarios.
- [x] `proposal.md` — Why / What Changes / Capabilities / Impact (docs-only).
- [x] PRD `caspar.md` — C-001 set to `[~]`.
- [x] `pnpm openspec validate caspar-bridge-architecture --strict` green;
      `pnpm format:check` green.

## 2. Phase 1 — Bridge skeleton + browser selection/fallback (follow-up change)

> Integration-tested against `tools/amcp-mock`. No real sockets yet — proves the
> wire, selection, and fallback first.

- [ ] `tools/caspar-bridge` package (mirrors `tools/amcp-mock`: `createBridge` +
      `bin/`), localhost-only by default, browser-safe WS port.
- [ ] WebSocket server speaking the `@cg/shared-ipc` contract (request/response +
      publish framing per `design.md` §4), Zod-validated at the boundary. Answered
      by a stub/`MockRuntime`-equivalent in this phase.
- [ ] Browser `apps/runtime/src/platform/WebSocketRuntime.ts` implementing the
      unchanged `RuntimeBridge` by relaying channel calls over the WS.
- [ ] **Async** `createRuntimeBridge`: probe the bridge WS once at boot (default
      1500ms timeout) → `WebSocketRuntime` if connected, else `MockRuntime`;
      `main.tsx` awaits behind a brief "connecting…" state (`design.md` §7.2).
- [ ] **Tri-state mode indicator** (live / OFFLINE-mock / DISCONNECTED) in the
      Runtime UI — persistent + unmistakable.
- [ ] **Never-silent-downgrade:** on a previously-live WS drop, `WebSocketRuntime`
      enters DISCONNECTED/reconnecting and **rejects** take/update/out with a clear
      error (no mock fall-back, no stale on-air); on reconnect the renderer
      re-pulls a full snapshot (stack / health / lock).
- [ ] Tests: `WebSocketRuntime` against a bridge-over-`amcp-mock` / fake WS;
      boot offline-fallback (probe refused/timed out → mock indicator); mid-session
      drop rejects commands + re-snapshots on reconnect; Playwright E2E for the
      tri-state indicator. Full green gate.

## 3. Phase 2 — Real command + OSC path (follow-up change)

> Swap the stub for the real `@cg/caspar-client` stack behind the unchanged
> `RuntimeBridge`. Integration-tested against `tools/amcp-mock` (acks + OSC).

- [ ] Bridge hosts the real `ServerSession` + `CommandQueue`; take/update/out
      reach the server (amcp-mock acks). (AC1)
- [ ] Real OSC → interest → rate-limit → change-track → `Reconciler` →
      `StackItemState` deltas → `publish(StackStateChangedChannel)`. (AC2)
- [ ] Command-construction **seam** introduced (`design.md` §9) — load /
      keep-alive / update / out for HTML producers.
- [ ] Tests: take/update/out reach `amcp-mock`; emitted OSC drives reconciled
      deltas over the WS under `--osc-hz 50 --channels 2`; reconnect re-enters
      `RESYNCING`. Full green gate.

## 4. Phase 3 — Redundancy + on-hardware validation (follow-up change)

- [ ] Real `RedundancyAdapter` failover (primary→backup per `strategy`);
      `connections.health` reflects `currentPrimary` + `lastFailover`. (AC4)
- [ ] Real OSC confirmations end-to-end.
- [ ] **On-hardware** validation against real CasparCG 2.3.2 — nail the AMCP
      load/keep-alive/update/stop sequence (ADR 0006); slot it into the seam.
- [ ] Update ADR 0006 + Phase 4 §9 with the verified sequence.
- [ ] Tests: failover under induced primary failure (amcp-mock); documented
      on-hardware result. Full green gate.

## 5. Close-out (this change)

- [ ] Design review by the user.
- [ ] On confirmation, archive `caspar-bridge-architecture` (docs-only gate);
      C-001 stays `[~]` until the phased changes land the behavior, then `[x]`.
      Do **not** archive automatically.
