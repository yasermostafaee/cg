# Design — Local CasparCG bridge + real transport (C-001)

> **Scope of this change:** design + docs only. It settles the architecture,
> the browser↔bridge contract, and the phased plan. It writes **no** protocol
> wiring and changes **no** app behavior. Phases 1–3 (below) each land as their
> own follow-up OpenSpec change.

## 1. Problem

The browser Runtime cannot open raw TCP (AMCP) or UDP (OSC) sockets, so it runs
against an in-memory `MockRuntime`. Real playout needs a localhost process that
holds the sockets. The open question the PRD flags — **"where does the
reconciler run?"** — is the crux, and it forces a thin-vs-thick decision.

## 2. Decision: thick bridge (smart proxy), not a thin byte-relay

We run the **entire** `@cg/caspar-client` stack **inside** a localhost Node
bridge (`tools/caspar-bridge`). The browser talks to it over a single WebSocket
using the **existing `@cg/shared-ipc` contract** — the same one `MockRuntime`
implements today. Recorded durably in
[ADR 0008](../../../docs/adrs/0008-thick-caspar-bridge.md).

### 2.1 Why this reverses the PRD's thin-bridge assumption

ADR 0007 and C-001 assumed protocol logic "stays browser-side behind a transport
interface; only the socket transport is missing." Inspecting the code, that
premise does **not** hold:

| Claim in ADR 0007 / C-001              | Reality in `packages/caspar-client/src`                                                                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "protocol stays browser-side"          | Every stateful class extends `node:events` `EventEmitter`: `ServerSession`, `CommandQueue`, `Reconciler`, `RedundancyAdapter`, `LayerManager`, `HeartbeatService`, both transports. Browser-side means shimming `node:events`.                                 |
| "behind a transport interface"         | No such interface exists. `AmcpTransport` imports `node:net`; `OscTransport` imports `node:dgram`. `ServerSession` constructs them directly (`createAmcp`/`createOsc`/`createQueue` options exist only for **test** mock substitution, not as a browser seam). |
| "only the socket transport is missing" | Extracting+publishing a transport interface and a browser `node:events` shim is _more_ work than hosting the stack natively — and it would put a frame-rate OSC stream on the React main thread.                                                               |

So thick is **lower-friction** (reuse the stack as-is, no shim, no extraction)
**and** better for performance (telemetry stays off the main thread). See §6.

## 3. Target topology

```
┌─ Browser (Runtime SPA) ─────────────┐         ┌─ tools/caspar-bridge (Node, localhost) ──────────────┐        ┌ CasparCG ┐
│ renderer (React, Zustand)           │         │ WS server (JSON frames, @cg/shared-ipc)              │ AMCP   │ server A │
│   │  window.cg : RuntimeBridge      │  WS      │   │  handle(stack.*, connections.*, lock.*, …)       │ TCP →  │ (primary)│
│   ▼                                 │ ───────▶ │   ▼                                                  │ ─────▶ │          │
│ WebSocketRuntime (RuntimeBridge)    │  JSON    │ RuntimeService  (was MockRuntime's role)             │ OSC    │ server B │
│   • request/response over WS        │ ◀─────── │   ├─ RedundancyAdapter ─ ServerSession A / B          │ UDP ←  │ (backup) │
│   • subscribe to *.state-changed    │  push    │   │     ├─ CommandQueue → AmcpTransport (node:net)    │        └──────────┘
│ MockRuntime (offline fallback)      │         │   │     └─ OscTransport (node:dgram) → OSC pipeline    │
└─────────────────────────────────────┘         │   ├─ Reconciler ──► StackItemState deltas ──► publish │
                                                 │   └─ command-construction seam (ADR 0006)             │
                                                 └───────────────────────────────────────────────────────┘
```

The bridge **is** the Runtime's old Electron "Main process," re-hosted as a
localhost service. `RuntimeService` plays the role `MockRuntime` plays today —
it owns the truth and answers the same channels — but backed by the real stack.

## 4. The wire protocol is `@cg/shared-ipc` over one WebSocket

We do **not** invent an AMCP/OSC-over-WebSocket byte protocol. The browser↔bridge
contract is the channels already defined in `@cg/shared-ipc` and already
implemented by `MockRuntime`:

- **Request/response** (`Channel`): `stack.load`, `stack.take`, `stack.update`,
  `stack.out`, `stack.remove`, `stack.snapshot`, `connections.config`,
  `connections.health`, `connections.failover`, `lock.*`, `templates.*`,
  `audit.*`, `update.*`, `settings.*`.
- **Push** (`PublishChannel`): `stack.state-changed`,
  `connections.health-changed`, plus the lock/update/settings change pushes.

### 4.1 Framing

A single WebSocket carries two framed message kinds (JSON text frames):

```ts
// browser → bridge
{ kind: 'request', id: string, channel: string, payload: unknown }
// bridge → browser (reply to a request)
{ kind: 'response', id: string, ok: true, result: unknown }
                  | { kind: 'response', id: string, ok: false, error: { message: string } }
// bridge → browser (unsolicited)
{ kind: 'publish', channel: string, payload: unknown }
```

- `id` is a monotonically increasing per-connection correlation id; the browser
  resolves the matching pending promise. (This mirrors `invoke`/`handle`'s
  request/response pairing; `definePublishChannel` payloads map to `publish`.)
- **Both ends parse with the channel's Zod schema** at the boundary — the same
  guardrail Electron IPC had. A malformed publish is swallowed (per `subscribe`'s
  existing `onError` contract); a malformed request gets an `ok:false` response.
- `void`-request channels (e.g. `stack.snapshot`, `connections.config`) send an
  absent/empty payload.

### 4.2 Why this is the right seam

`MockRuntime` is the reference implementation of exactly this contract. The
bridge re-implements the same `handle(channel, …)` surface against the real
stack; the browser's `WebSocketRuntime` re-implements the same `RuntimeBridge`
the renderer already consumes. The renderer does not change.

## 5. OSC return path — tamed entirely in the bridge

CasparCG pushes OSC at channel frame rate (e.g. 50 Hz × channels). That firehose
is consumed and reduced **inside the bridge** by the existing pipeline:

```
OscTransport(node:dgram) → OscInterestFilter → OscRateLimiter → OscChangeTracker → Reconciler
                                                                                       │
                                                                  StackItemState[] deltas
                                                                                       ▼
                                                          publish(StackStateChangedChannel)  ── WS ──▶ browser store
```

**Only reconciled `StackItemState` snapshots/deltas cross the WebSocket**, at a
UI-appropriate cadence. Raw OSC never reaches the browser. This is the core
performance reason for thick over thin (§6) and directly satisfies C-001's
"stack item states update from real confirmations (not the mock state machine)."

## 6. Performance rationale (thick vs thin), explicitly

| Concern                  | Thin (reconciler in browser)                                  | Thick (reconciler in bridge) ✅                         |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| OSC volume on the wire   | Full frame-rate stream → WebSocket → browser                  | Stays in-process in the bridge; only deltas cross       |
| Main-thread work         | interest/rate-limit/change-track/reconcile compete with React | Bridge process does it; browser applies deltas to store |
| `node:events` in browser | Needs a shim for every `caspar-client` class                  | Not needed — native Node                                |
| New code                 | Transport interface extraction + shim + browser host          | A thin WS host + `WebSocketRuntime`                     |

## 7. Browser side: `WebSocketRuntime`, selection, and offline fallback

### 7.1 `WebSocketRuntime` implements the unchanged `RuntimeBridge`

A new `apps/runtime/src/platform/WebSocketRuntime.ts` implements `RuntimeBridge`
by relaying each method to a request frame and returning the correlated
response; `on*Changed` subscriptions register against incoming `publish` frames.
`MockRuntime` is **retained** unchanged as the offline fallback.

### 7.2 Selection at boot, and never a silent downgrade

**Decided.** `createRuntimeBridge()` becomes **async** and decides the backend
**once** at startup by probing the configured bridge WebSocket with a short
timeout (**default 1500ms**); `main.tsx` awaits it before first render, keeping
the "ready before first render" guarantee via a brief "connecting…" state. We do
**not** take the mock-first-upgrade shape — the backend is chosen once and does
not swap underneath a running session.

The mode is a **tri-state** indicator, not a binary, because "mock" and
"disconnected" are different truths the operator must never confuse:

| Mode               | When                                              | Commands                        | Indicator                                   |
| ------------------ | ------------------------------------------------- | ------------------------------- | ------------------------------------------- |
| **live**           | boot probe connected within the timeout           | go to the bridge → CasparCG     | "connected / live"                          |
| **offline (mock)** | boot probe refused / timed out → `MockRuntime`    | exercised against the mock      | persistent "OFFLINE (mock) — not connected" |
| **disconnected**   | a previously-**live** WebSocket drops mid-session | **rejected** with a clear error | "DISCONNECTED — reconnecting"               |

**The critical invariant: a live connection is never silently downgraded.** If
the bridge drops mid-session, `WebSocketRuntime` enters a visible
DISCONNECTED/reconnecting state and **rejects** take / update / out with a clear
error — it does **not** fall back to the mock and does **not** report stale state
as on-air. (Routing live commands to a mock, or freezing the last on-air state as
if real, are both unacceptable for an on-air tool.) On reconnect the renderer
re-pulls a **full snapshot** (stack / health / lock) to resync; the bridge side
runs a fresh `RESYNCING` window. The mock is strictly a **boot-time** decision.

### 7.3 No Node imports cross into the renderer

`WebSocketRuntime` uses only the browser `WebSocket` API + `@cg/shared-ipc`
(isomorphic schemas). `@cg/caspar-client` is **never** imported by the
renderer or `apps/runtime/src/platform` browser code — it lives only in
`tools/caspar-bridge`. The lint boundary (no `node:*` in browser code) stays
clean.

## 8. Bridge packaging

- `tools/caspar-bridge`: a small Node package exporting `createBridge(config)`
  and a `bin/` CLI, mirroring `tools/amcp-mock`'s shape (`createMock` + bin).
- **Loopback-only by default, enforced at socket bind** — the WS server binds
  `127.0.0.1` (not `0.0.0.0`) unless a host is explicitly configured; this is a
  bind-level guarantee, not a documentation note, so non-loopback origins cannot
  reach it. LAN exposure is opt-in config, never the default. No auth in v1
  because it's loopback-only; revisit if exposed.
- Instantiated from a `ConnectionConfig` (`connections.config` schema: servers
  A/B endpoints, `strategy`, `autoFailoverEnabled`). The browser reads/edits this
  via the existing `connections.config` channel; the bridge owns the live config.
- One WebSocket port (default to a browser-**safe** port — note the runtime SPA's
  own default port `6000` is on Chrome's `ERR_UNSAFE_PORT` blocklist, so pick a
  safe one here, e.g. `5280`).

## 9. ADR 0006 dependency — the command-construction seam

**Unresolved on real hardware (ADR 0006):** the exact AMCP sequence to
load / keep-alive / **update** / stop an HTML producer. On CasparCG 2.3.2,
`CG … INVOKE 1 "update" "<json>"` called `window.update` with an **empty**
payload, and `CALL … "update"` returned `202 CALL OK` but never invoked
`window.update`. So the verified "push JSON to `window.update`" sequence is
**not yet known**.

**Design response:** put the bridge's AMCP command construction behind a small
**seam** — e.g. a `CommandBuilder` with `load(slot, template) / update(slot,
fields) / out(slot)` returning AMCP command strings — so the verified sequence
(and any fallback from ADR 0006: URL-query-string initial data, or a WS sidekick
in the template) can be slotted in **without** reworking `ServerSession` /
`CommandQueue` / `Reconciler`. Phases 1–2 build and test against
`tools/amcp-mock` (which acks deterministically). **Phase 3 is the on-hardware
gate** that nails the real sequence and then updates ADR 0006 + Phase 4 §9.

## 10. Connection lifecycle & failure modes

- **Bridge reachable, server reachable:** take/update/out → `RuntimeService` →
  `RedundancyAdapter` → active `ServerSession` → `CommandQueue` → `AmcpTransport`
  → CasparCG. (C-001 AC1.)
- **OSC arrives:** §5 pipeline → reconciled deltas → `stack.state-changed`.
  (C-001 AC2.)
- **Bridge absent at boot / WS fails to open:** `MockRuntime`, persistent
  "OFFLINE (mock)" indicator, no crash. (C-001 AC3; §7.2.)
- **Primary fails (OSC silence / amcp-ping-fail / command-timeouts / 5xx-burst):**
  `RedundancyAdapter` switches to backup per `strategy`; `connections.health`
  reflects the new `currentPrimary` and `lastFailover`. (C-001 AC4.)
- **Bridge dies mid-session (was live):** browser detects WS close → visible
  **DISCONNECTED/reconnecting**; take / update / out are **rejected** with a clear
  error — **no** silent fall-back to the mock, **no** stale state shown as on-air
  (§7.2). On reconnect the renderer re-pulls a full snapshot (stack / health /
  lock) and the bridge runs a fresh `RESYNCING` window.

## 11. Testing strategy

Every phase is integration-tested against **`tools/amcp-mock`** (programmable
CasparCG 2.3.x stand-in: AMCP/TCP + OSC/UDP, `--osc-hz`, `--channels`, trace).
The bridge connects to `amcp-mock` exactly as it would to real CasparCG; tests
assert take/update/out reach it (acks) and that emitted OSC drives reconciled
`StackItemState` deltas over the WebSocket. The browser side gets a fake
WebSocket / a real bridge-against-mock for `WebSocketRuntime` and the
offline-fallback path. Real-hardware validation (ADR 0006 sequence) is the
Phase 3 gate, not an `amcp-mock` test.

## 12. Phased implementation plan

Each phase is its **own** follow-up OpenSpec change (one branch, one PR), gated
and integration-tested against `tools/amcp-mock`.

- **Phase 1 — Bridge skeleton + browser selection/fallback.**
  `tools/caspar-bridge` with a WebSocket server speaking the `@cg/shared-ipc`
  contract (framing in §4); browser `WebSocketRuntime` (`RuntimeBridge` impl);
  bridge-reachability detection; offline → `MockRuntime` fallback with the mode
  indicator. The bridge may answer from a stub/`MockRuntime`-equivalent here —
  **no real sockets yet** — so the wire + selection + fallback are proven first.

- **Phase 2 — Real command + OSC path.** Wire real take/update/out through
  `ServerSession` + `CommandQueue` to a server (`amcp-mock` acks); real OSC →
  pipeline → `Reconciler` → `StackItemState` deltas → `stack.state-changed`.
  Swap the bridge's stub for the real `@cg/caspar-client` stack behind the
  unchanged `RuntimeBridge`. Introduce the §9 command-construction seam.
  **NOTE — outbound delta coalescing:** under churn, coalesce pending
  `StackItemState` deltas **per `itemId` (last-write-wins)** before publishing;
  do **not** unbounded-queue them. A slow or busy renderer must never accumulate a
  growing backlog of stale per-item states — the browser only ever needs the
  latest state per item. (The in-bridge `OscRateLimiter` + `OscChangeTracker`
  bound the input side; this bounds the output side.)

- **Phase 3 — Redundancy + on-hardware validation.** Real `RedundancyAdapter`
  failover (primary→backup per `strategy`) and real OSC confirmations; on-hardware
  validation including the **ADR 0006** AMCP-update sequence. Update ADR 0006 /
  Phase 4 §9 with the verified sequence and slot it into the seam.

## 13. Risks & open questions

- **ADR 0006 (high):** if no AMCP sequence reliably delivers JSON to
  `window.update` on 2.3.2, fall back to URL-query initial data or a template-side
  WebSocket sidekick (both noted in ADR 0006). The §9 seam contains the blast
  radius to one module.
- **Async bootstrap (resolved, §7.2):** `createRuntimeBridge` becomes async and
  probes once at boot (1500ms); `main.tsx` awaits behind a short "connecting…"
  state. Decided — not mock-first-upgrade. The remaining Phase-1 care is the
  mid-session DISCONNECTED handling (reject commands, re-snapshot on reconnect),
  not the boot shape.
- **Reconnect/resync correctness (medium):** bridge-restart and server-reconnect
  both must re-enter `RESYNCING`; covered by Phase 2/3 `amcp-mock` tests.
- **Backpressure (low):** even reconciled deltas could burst on large stacks;
  the existing `OscRateLimiter` + change-tracking bound this, but Phase 2 should
  confirm delta cadence under `--osc-hz 50 --channels 2`.
- **Port safety (low):** pick a browser-safe WS port for the bridge (§8).

## 14. Out of scope (here)

Any source/test/build change; the concrete protocol wiring (Phases 1–3); the
real AMCP sequence (Phase 3 / ADR 0006); preset/rundown control (C-002) and the
sports model (C-004+), which build **on** this bridge.
