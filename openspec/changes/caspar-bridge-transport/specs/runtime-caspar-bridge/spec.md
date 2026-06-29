# runtime-caspar-bridge (C-001 — Phase 1: transport, selection, resilience)

## MODIFIED Requirements

### Requirement: Browser↔bridge wire protocol is `@cg/shared-ipc` over a WebSocket

The browser and the bridge SHALL communicate over a single WebSocket carrying the
existing `@cg/shared-ipc` request/response and publish channels as JSON frames —
the same contract `MockRuntime` implements. The system SHALL NOT define a
low-level AMCP/OSC byte protocol over the WebSocket. Both ends SHALL validate
each frame against the channel's Zod schema at the boundary.

The wire **frame envelope** SHALL be defined once and shared by both ends (in
`@cg/shared-ipc`), as JSON-serialized frames discriminated by `type`:

- `request` — `{ type: 'request', id, channel, payload }`
- `response` — `{ type: 'response', id, payload }` or `{ type: 'response', id, error }`
- `publish` — `{ type: 'publish', channel, payload }`

A request and its response SHALL be correlated by `id`. The inner `payload` of
each frame SHALL be the existing channel's request / response / publish schema,
validated against that channel before dispatch (request) and before send
(response/publish).

In Phase 1 the bridge answers from a throwaway in-memory backing (no
`@cg/caspar-client`, no real sockets); Phase 2 replaces that backing behind the
unchanged envelope.

#### Scenario: Channel calls are relayed over the WebSocket

- **WHEN** the renderer invokes a `RuntimeBridge` method **THEN** it is serialized
  as the corresponding `@cg/shared-ipc` channel frame, answered by a correlated
  response frame, and push channels arrive as `publish` frames — with the renderer
  unchanged

#### Scenario: Round-trip is provable end to end through an in-memory backing

- **WHEN** the bridge runs its in-memory backing and a `WebSocketRuntime` connects
  **THEN** `stack.load` / `take` / `update` / `out` issued over the WebSocket are
  reflected back to the browser via `stack.state-changed` publish frames, proving
  the full request/response + publish round-trip without any real CasparCG

#### Scenario: Frames are schema-validated at the boundary

- **WHEN** a frame arrives whose inner payload does not match its channel schema
  **THEN** it is rejected at the boundary (the request gets an `error` response;
  a malformed publish is dropped) rather than reaching application logic
