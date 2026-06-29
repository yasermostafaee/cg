# ADR 0008 — Thick CasparCG bridge (smart proxy), not a thin byte-relay

- **Status:** Accepted
- **Date:** 2026-06-29
- **Supersedes (in part):** ADR 0007 §"CasparCG transport is deferred to a
  local bridge" — the _bridge_ decision stands; the _"protocol stays
  browser-side behind a transport interface; only the socket transport is
  missing"_ premise does **not**, and is reversed here.
- **Related:** ADR 0006 (AMCP update mechanism unresolved), ADR 0004/0005 (OSC
  schema / frame-rate sync), PRD C-001, OpenSpec change
  `caspar-bridge-architecture`.

## Context

ADR 0007 deferred CasparCG control to "a small local **WebSocket↔TCP/UDP
bridge**" and assumed a **thin** split: _"The pure protocol logic in
`@cg/caspar-client` (command building, response parsing, reconciler,
redundancy) stays browser-side behind a transport interface; only the socket
transport lives in the bridge."_ PRD C-001 inherited that assumption verbatim
("only the socket transport is missing").

When we went to act on it, the premise didn't survive contact with the code:

- **`@cg/caspar-client` is Node-tier throughout, not transport-abstracted.**
  Every stateful class extends `node:events` `EventEmitter`
  (`ServerSession`, `CommandQueue`, `Reconciler`, `RedundancyAdapter`,
  `LayerManager`, `HeartbeatService`, `OscTransport`, `AmcpTransport`).
  `AmcpTransport` imports `node:net`; `OscTransport` imports `node:dgram`.
  `ServerSession` directly constructs `AmcpTransport`/`OscTransport`/
  `CommandQueue` (its `create*` options exist only so tests can substitute
  mocks — they are not a browser transport seam). There is **no** published
  transport interface that the browser could implement; "swap the transport"
  would mean inventing one and shimming `node:events` into the browser.
- **The OSC return path is a frame-rate firehose.** CasparCG pushes OSC at the
  channel frame rate (e.g. 50 Hz × channels). Browser-side reconciliation would
  pump that entire stream across the wire and run interest-filtering →
  rate-limiting → change-tracking → reconciliation on the **browser main
  thread**, competing with React. That is exactly the work the bridge process
  should absorb.

So the thin split is both **higher-friction** (extract a transport interface +
ship a `node:events` browser shim) and **worse for performance** (telemetry on
the main thread) than the alternative.

## Decision

Adopt a **thick bridge / smart proxy**. The bridge is not a byte-relay; it is
the Runtime's "Main process" reincarnated as a localhost Node service.

1. **The full `@cg/caspar-client` stack runs _inside_ the bridge**
   (`tools/caspar-bridge`), in its native Node tier: `ServerSession` +
   `CommandQueue` + the OSC pipeline + `Reconciler` + `RedundancyAdapter`. No
   transport-interface extraction; no `node:events` browser shim;
   `AmcpTransport`/`OscTransport` are used **as-is** with real sockets.
2. **The browser↔bridge wire protocol is the existing `@cg/shared-ipc`
   request/response + publish channels**, serialized as JSON frames over a
   **single WebSocket** — the very contract `MockRuntime` implements today
   (`stack.*`, `connections.*`, `lock.*`, `templates.*`, …, plus the
   `*.state-changed` / `*.health-changed` pushes). We do **not** invent a
   low-level AMCP/OSC byte protocol over WebSocket.
3. **The OSC firehose is consumed and tamed entirely inside the bridge**
   (interest → rate-limit → change-track → Reconciler). Only reconciled
   `StackItemState` deltas cross the WebSocket, via `StackStateChangedChannel`.
   This keeps high-frequency telemetry off the browser main thread — the core
   performance reason for thick over thin.
4. **The browser gets a `WebSocketRuntime`** that implements the **unchanged**
   `RuntimeBridge` by relaying channel calls over the WebSocket. `MockRuntime`
   is **retained** as the offline fallback. The Runtime selects
   `WebSocketRuntime` when the bridge is reachable, else `MockRuntime` — same UI
   either way, with a clear offline/mock indicator (satisfies C-001's "bridge
   absent → degrade, don't crash").
5. **Bridge packaging:** a small Node WebSocket server in `tools/caspar-bridge`,
   **localhost-only by default**, instantiated from a `ConnectionConfig`
   (servers A/B, strategy, auto-failover).

## Consequences

- **No new packages, no `node:events` browser shim.** `@cg/caspar-client` stays
  Node-only and unchanged; `tools/caspar-bridge` is a new thin _host_ around it.
  The browser's only new code is `WebSocketRuntime` (a `RuntimeBridge` impl) +
  bridge-reachability detection + the offline indicator.
- **The wire contract is already designed and validated.** `@cg/shared-ipc`
  channels carry Zod schemas; both ends parse, so drift is caught at the
  boundary. `MockRuntime` is the reference implementation of the same contract.
- **Main-thread budget protected.** The browser receives only reconciled state
  deltas at a UI-appropriate cadence, never raw OSC.
- **ADR 0006 risk is isolated to one seam.** The unresolved AMCP HTML-producer
  update sequence (CG INVOKE / CALL did not deliver the JSON payload to
  `window.update` on 2.3.2) sits behind a small **command-construction seam** in
  the bridge, so the verified sequence can be slotted in without reworking the
  stack. On-hardware validation is a Phase 3 gate that also updates ADR 0006 /
  Phase 4 §9.
- **Reversibility.** If a future need (e.g. a hosted multi-operator deployment)
  argues for moving protocol logic elsewhere, the `RuntimeBridge` contract is
  still the seam — only the implementation behind it changed, exactly as in
  ADR 0007.

## Alternatives considered

- **Thin byte-relay (the original ADR 0007 assumption).** Extract a transport
  interface from `caspar-client`, ship a `node:events` browser shim, run the
  reconciler/redundancy in the browser, relay raw AMCP/OSC bytes over WebSocket.
  Rejected: more code to write, a frame-rate OSC stream on the main thread, and
  no existing transport seam to build on.
- **A bespoke low-level WS protocol (AMCP/OSC framed over WebSocket).** Rejected:
  re-invents `@cg/shared-ipc`, abandons the Zod-validated contract `MockRuntime`
  already implements, and pushes protocol concerns back into the browser.
