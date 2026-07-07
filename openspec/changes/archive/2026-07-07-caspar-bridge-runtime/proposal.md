# Caspar bridge — Phase 2: real caspar-client stack backing (C-001)

## Why

Phase 1 proved the browser↔bridge transport (the `@cg/shared-ipc` envelope over
one WebSocket) and the boot selection + resilience, backed by a **throwaway
in-memory** `RuntimeBacking`. Phase 2 delivers on that promise: **swap the
backing for the real `@cg/caspar-client` stack** — `ServerSession` +
`CommandQueue` + the OSC pipeline + `Reconciler` + `LayerManager` — now that it
runs in its native Node tier inside `tools/caspar-bridge`.

This is a **backing swap only**. The browser wire (`@cg/shared-ipc` envelope) and
`WebSocketRuntime` are **unchanged**; the Phase-1 offline/mock + DISCONNECTED
behaviours stay intact (the browser side is untouched). The bridge now drives a
real CasparCG server, and the **Reconciler becomes the single source of truth**
for stack state — the in-memory state machine is gone.

Integration is tested **only against `tools/amcp-mock`** — NOT real hardware
(that, plus redundancy/failover, is Phase 3).

## What Changes

- **`tools/caspar-bridge`** — replace `RuntimeBacking` with a real
  `CasparRuntime` that owns a `ServerSession` (AMCP TCP + OSC UDP from a
  connection config), a `Reconciler` (source of truth), a `LayerManager` (slot
  allocation), and an **AMCP command-construction seam** (ADR 0006). It does NOT
  import `@cg/caspar-client`'s browser-forbidden bits into the renderer — it's
  Node-tier and lives only in the bridge.
- **Command mapping (behind the seam)** — `load → CG ADD`, `take → CG PLAY`,
  `update → CG UPDATE`, `out → CLEAR`. Construction stays behind the seam so the
  hardware-verified sequence slots in at Phase 3 with no stack rework. Marked
  clearly in code AND spec: this sequence is **amcp-mock-validated, NOT
  hardware-validated**. (ADR 0006's candidate update verbs `CALL "update"` /
  `CG INVOKE` are unresolved; `amcp-mock` acks `CG UPDATE`, so Phase 2 uses it.)
- **OSC → truth** — `amcp-mock` emits OSC → the bridge's OSC pipeline (built into
  `OscTransport`: interest → rate-limit → change-track) → `Reconciler.applyOsc` →
  published `StackItemState`. The OSC interest set is driven by `LayerManager`
  allocations. Outbound deltas are **coalesced per `itemId` (last-write-wins),
  never unbounded-queued** (the Phase-2 NOTE).
- **Bridge stays bound to `127.0.0.1` by default.** `createBridge` gains a
  `connection` config (servers + OSC bind).

## Capabilities

- `runtime-caspar-bridge` (MODIFIED): the thick-bridge backing is now the real
  `@cg/caspar-client` stack; the `Reconciler` is the source of truth;
  take/update/out reach the server as AMCP and stack state updates from real OSC
  confirmations. All amcp-mock-validated; hardware validation + redundancy are
  Phase 3.

## Impact

- `@cg/caspar-bridge` (new `CasparRuntime` + command seam; depends on
  `@cg/caspar-client`; `RuntimeBacking` deleted), `@cg/caspar-client` (consumed,
  unchanged). No change to `@cg/shared-ipc` or `@cg/runtime` source — the wire and
  browser are unchanged (they're re-gated to prove nothing regressed).
- Tests: an `amcp-mock` integration test proving (a) take/update/out reach the
  server as AMCP and are acked, and (b) emitted OSC drives stack state from real
  confirmations (not an internal state machine).
- C-001 stays `[~]` — Phase 3 (real redundancy/failover + on-hardware
  AMCP-sequence validation) remains.
