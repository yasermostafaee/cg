# Design — Caspar bridge Phase 1 (C-001)

Key decisions only; the architecture lives in the archived
`caspar-bridge-architecture` / `runtime-caspar-bridge` spec.

## Frame envelope (shared, in `@cg/shared-ipc`)

JSON frames discriminated by `type`, defined once and imported by both the Node
bridge and the browser `WebSocketRuntime`:

```ts
request  { type: 'request',  id, channel, payload }
response { type: 'response', id, payload }  |  { type: 'response', id, error: { message } }
publish  { type: 'publish',  channel, payload }
```

A `type` discriminant is added (the archived design listed
request/response/publish without one); it makes the union unambiguous and
Zod-`discriminatedUnion`-friendly. Correlation is by `id` (monotonic per
connection). Inner `payload` is the existing channel schema, validated at the
boundary — request payload parsed before dispatch, response/publish parsed before
send. Every `RuntimeBridge` method maps to a defined channel (`app.info`,
`stack.*`, `connections.*`, `lock.*`, `templates.*`, `audit.recent`, `update.*`,
`settings.*`); publishes are `stack.state-changed`, `connections.health-changed`,
`lock.state-changed`, `update.state-changed`, `settings.changed`.

## Throwaway in-memory backing

The bridge's Phase-1 backing mirrors `MockRuntime`'s state machine (Node-side: no
`localStorage`, no browser crypto) so the round-trip is provable. It is
explicitly disposable — Phase 2 swaps it for the real `@cg/caspar-client` stack
behind the unchanged envelope. The bridge MUST NOT import `@cg/caspar-client`.

## Loopback bind

`createBridge` passes `host` (default `127.0.0.1`) to `new WebSocketServer({
host, port })`, so loopback is enforced at the socket bind, not just documented.

## Browser `WebSocketRuntime` + tri-state link status

- Implements the unchanged `RuntimeBridge` over a native `WebSocket` (injectable
  factory for tests — no Node imports in renderer/platform browser code).
- New `link: { status(): BridgeLinkStatus; onStatusChanged() }` on `RuntimeBridge`
  with `BridgeLinkStatus = 'live' | 'offline-mock' | 'disconnected'`. The mock
  path reports a constant `offline-mock`; `WebSocketRuntime` reports `live` while
  OPEN and `disconnected` after a mid-session drop.
- **Never a silent downgrade:** on drop, in-flight and subsequent
  take/update/out reject with a clear error — `WebSocketRuntime` never touches a
  mock and never reports optimistic on-air. On reconnect it re-pulls
  `stack.snapshot` + `connections.health` + `lock.state` and pushes them to the
  `on*` subscribers so the renderer store resyncs.

## Selection at boot

`createRuntimeBridge()` is async: probe the configured bridge WS (default
`ws://127.0.0.1:5280`, overridable via `window.__CG_BRIDGE_URL__` for E2E) with a
**1500ms** timeout. Connected → `WebSocketRuntime`; refused/timeout →
`MockRuntime` wrapper. `main.tsx` awaits before render. The chosen backend is
fixed for the session (no mock-first hot-swap).

## Testing

- Unit tests inject a fake/`ws` WebSocket so they need no Node ≥22 global
  `WebSocket`. The bridge integration test boots `@cg/caspar-bridge` and connects
  a `WebSocketRuntime` using `ws`'s client as the factory.
- E2E drives real boot/selection/downgrade: the Playwright fixture optionally
  starts `@cg/caspar-bridge` on an ephemeral port and sets `window.__CG_BRIDGE_URL__`
  before app JS, then asserts the indicator text (live / OFFLINE / DISCONNECTED).
