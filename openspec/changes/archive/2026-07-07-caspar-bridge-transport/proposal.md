# Caspar bridge — Phase 1: transport, selection, resilience (C-001)

## Why

The archived `caspar-bridge-architecture` design (living spec
`runtime-caspar-bridge`) settled the thick-bridge architecture and laid out a
phased plan. **Phase 1** stands up the browser↔bridge **transport** and the
**boot selection + resilience** behaviour — without any real CasparCG. It proves
the whole round-trip (browser → WebSocket → bridge → published state → browser)
end to end against a throwaway in-memory backing, so Phase 2 can drop in the real
`@cg/caspar-client` stack behind the unchanged wire with no protocol surprises.

Scope is **transport + selection + resilience only**. No `@cg/caspar-client`, no
real sockets, no `ServerSession`/`Reconciler`/`amcp-mock` — those are Phase 2/3.

## What Changes

- **`@cg/shared-ipc`** — define the WebSocket **frame envelope** once and share
  it: `request { type, id, channel, payload }` / `response { type, id, payload? ,
error? }` / `publish { type, channel, payload }`, correlated by `id`. Zod-typed.
  This is the only wire framing; the inner payloads stay the existing channel
  request/response/publish schemas.
- **`tools/caspar-bridge` (new `@cg/caspar-bridge` workspace)** — a Node
  WebSocket server (`ws`) that speaks the existing `@cg/shared-ipc` contract over
  one socket, **binds `127.0.0.1` by default at the socket bind**, and is backed
  by a **minimal in-memory runtime** answering the full contract
  (load/take/update/out/remove/snapshot + `StackStateChanged`; health/lock/
  templates/audit/settings/update stubbed reasonably). The backing is explicitly
  **throwaway** — Phase 2 replaces it with the real stack. It does **not** import
  `@cg/caspar-client`.
- **`apps/runtime` browser `WebSocketRuntime`** — implements the unchanged
  `RuntimeBridge` by relaying each channel call over a native browser
  `WebSocket` (no Node imports), mapping `publish` frames to the `on*`
  subscriptions, and exposing a **tri-state link status**.
- **`createRuntimeBridge()` becomes async** — probes the configured bridge WS
  with a **1500ms** timeout: reachable → `WebSocketRuntime` (live); refused/timed
  out → existing `MockRuntime` (offline-mock). `main.tsx` awaits before render.
- **Tri-state connection indicator** (live / OFFLINE-mock / DISCONNECTED). A
  mid-session WS drop → DISCONNECTED: take/update/out are rejected with a clear
  visible error (never optimistic on-air, never routed to the mock); on reconnect
  the renderer re-pulls a full snapshot (`stack.snapshot` + `connections.health`
  - `lock.state`) to resync.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED): pins the concrete WebSocket frame envelope
  and the provable in-memory round-trip that Phase 1 introduces. The
  selection-at-boot, never-silent-downgrade, and loopback-bind requirements are
  **implemented** here as already specified.

## Impact

- `@cg/shared-ipc` (new `ws-frame` module + export), `@cg/caspar-bridge` (new
  workspace), `@cg/runtime` (new `WebSocketRuntime`, async `createRuntimeBridge`,
  `main.tsx`, tri-state indicator UI + bridge `link` status on `RuntimeBridge`).
- No schema change. The renderer's existing feature code is unchanged except for
  the new indicator and the link-status surface.
- Tests: a bridge↔`WebSocketRuntime` integration round-trip; unit tests for the
  three link states (reachable→live, absent→offline-mock, drop→DISCONNECTED +
  command rejection + snapshot-on-reconnect); a Playwright E2E mapping the
  boot/selection/downgrade scenarios.
- C-001 stays `[~]` — Phase 1 of several; Phases 2–3 remain.
