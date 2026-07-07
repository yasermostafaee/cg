# runtime-caspar-bridge Specification

## Purpose

TBD - created by archiving change caspar-bridge-architecture. Update Purpose after archive.

## Requirements

### Requirement: The bridge hosts the full caspar-client stack (thick bridge)

The system SHALL run the complete `@cg/caspar-client` stack — `ServerSession`,
`CommandQueue`, the OSC pipeline, `Reconciler`, and `RedundancyAdapter` — inside
a localhost Node bridge process (`tools/caspar-bridge`), using
`AmcpTransport`/`OscTransport` with real sockets. Protocol logic SHALL NOT run in
the browser, and `@cg/caspar-client` SHALL NOT be imported by the renderer or the
browser platform layer.

#### Scenario: Protocol stack runs in the bridge, not the browser

- **WHEN** the Runtime drives a real server **THEN** command building, response
  parsing, OSC reconciliation, and redundancy run in the bridge process, and no
  `@cg/caspar-client` / `node:*` import crosses into browser code

#### Scenario: Reversal of the thin-bridge assumption is recorded

- **WHEN** the architecture is consulted **THEN** ADR 0008 records the
  thick-bridge decision and ADR 0007's thin-bridge premise is marked reversed

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

### Requirement: Commands reach a reachable CasparCG server

The Runtime's take / update / out intents SHALL reach a reachable CasparCG server
through the bridge's `ServerSession` + `CommandQueue` + `AmcpTransport` whenever
the bridge is running and the server is reachable.

#### Scenario: Take/update/out reach the server

- **WHEN** the bridge is running and a CasparCG server is reachable **THEN**
  take / update / out from the Runtime reach the server

### Requirement: Stack state updates from real OSC confirmations

The OSC firehose SHALL be consumed and reduced entirely inside the bridge
(interest → rate-limit → change-track → `Reconciler`); only reconciled
`StackItemState` deltas SHALL cross the WebSocket via `StackStateChangedChannel`.
Stack item states SHALL reflect real OSC confirmations, not the mock state
machine.

#### Scenario: Real OSC drives stack state

- **WHEN** CasparCG emits OSC **THEN** the stack item states update from real
  confirmations (not the mock state machine), and raw OSC does not cross the
  WebSocket

### Requirement: Bridge selection at boot

`createRuntimeBridge()` SHALL be async and decide the backend **once** at startup
by probing the configured bridge WebSocket with a short timeout (default 1500ms).
The Runtime SHALL present the same UI either way and SHALL NOT crash when the
bridge is absent.

#### Scenario: Bridge reachable

- **WHEN** the bridge WebSocket connects within the timeout **THEN** the app uses
  the `WebSocketRuntime` and shows a "connected / live" indicator

#### Scenario: Bridge absent

- **WHEN** the probe is refused or times out **THEN** the app falls back to
  `MockRuntime` **AND** shows a persistent, unmistakable
  "OFFLINE (mock) — not connected to CasparCG" indicator

### Requirement: Live connection is never silently downgraded

A connection chosen as live SHALL NOT be silently replaced by the mock. A
mid-session loss of the bridge SHALL surface as a visible disconnected state with
rejected commands, never as on-air or mock activity.

#### Scenario: Bridge drops mid-session

- **WHEN** the WebSocket to a previously-connected bridge drops **THEN**
  `WebSocketRuntime` enters a visible DISCONNECTED/reconnecting state and
  take / update / out are rejected with a clear error (NOT shown as on-air, NOT
  routed to a mock)
- **AND** on reconnect the renderer re-pulls a full snapshot (stack / health /
  lock) to resync

#### Scenario: Command issued while disconnected

- **WHEN** the operator issues take / update / out while the bridge is down
  (disconnected/reconnecting) **THEN** the command is rejected with a visible
  error and is never shown optimistically as on-air

### Requirement: The bridge binds loopback by default

The bridge SHALL bind its WebSocket server to `127.0.0.1` by default, enforced at
socket bind (not merely documented). LAN exposure SHALL require explicit
configuration and SHALL never be the default.

#### Scenario: Default bind is loopback-only

- **WHEN** the bridge starts with no host override **THEN** it binds `127.0.0.1`
  at the socket level, so non-loopback origins cannot reach it

### Requirement: Failover to backup per the redundancy strategy

WHEN the active (primary) server fails, the bridge's `RedundancyAdapter` SHALL
switch to the backup per the configured redundancy strategy, and
`connections.health` SHALL reflect the new current primary and the last failover
event.

#### Scenario: Primary fails → failover to backup

- **WHEN** primary fails **THEN** failover switches to backup per the redundancy
  strategy and the reported connection health reflects the new primary

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / keep-alive / update / stop for
HTML producers) behind a small command-construction seam, so the verified
sequence is isolated from the session / queue / reconciler. The update sequence
is now **hardware-validated on CasparCG 2.3.2 (`4de6d18f` Dev)** per ADR 0006:
`load → CG ADD`, `take → CG PLAY`, **`update → CG UPDATE`**, `out → CLEAR`.
`CG UPDATE` delivers a Persian-laden JSON payload to `window.update` intact; the
disproven alternatives (`CALL "update"` never invokes it; `CG INVOKE` delivers an
empty param) are not used.

#### Scenario: The verified update sequence is applied at the seam

- **WHEN** the bridge updates a playing HTML producer **THEN** it issues the
  hardware-validated `CG UPDATE` via the command-construction seam — established
  on real CasparCG 2.3.2 (ADR 0006) — without changes to `ServerSession` /
  `CommandQueue` / `Reconciler`
