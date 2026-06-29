# runtime-caspar-bridge (C-001)

Architecture and contract for driving real CasparCG from the browser Runtime
through a localhost bridge. This change establishes the requirements; the
concrete protocol wiring is delivered by the phased follow-up changes
(`design.md` §12) that implement against these requirements and `tools/amcp-mock`.

## ADDED Requirements

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

#### Scenario: Channel calls are relayed over the WebSocket

- **WHEN** the renderer invokes a `RuntimeBridge` method **THEN** it is serialized
  as the corresponding `@cg/shared-ipc` channel frame, answered by a correlated
  response frame, and push channels arrive as `publish` frames — with the renderer
  unchanged

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
HTML producers) behind a small command-construction seam, so the
on-hardware-verified sequence (ADR 0006) can be slotted in without reworking the
session / queue / reconciler. The verified sequence SHALL be established on real
CasparCG before this capability is considered complete, and ADR 0006 / Phase 4 §9
SHALL be updated with it.

#### Scenario: The update sequence can change without reworking the stack

- **WHEN** the verified AMCP update sequence is determined on real hardware
  **THEN** it is applied at the command-construction seam without changes to
  `ServerSession` / `CommandQueue` / `Reconciler`, and ADR 0006 is updated
