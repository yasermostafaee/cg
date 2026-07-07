# runtime-caspar-bridge Specification

## Purpose

TBD - created by archiving change caspar-bridge-architecture. Update Purpose after archive.

## Requirements

### Requirement: The bridge hosts the full caspar-client stack (thick bridge)

The system SHALL run the complete `@cg/caspar-client` stack — `ServerSession`,
`CommandQueue`, the OSC pipeline, `Reconciler`, and `LayerManager` — inside a
localhost Node bridge process (`tools/caspar-bridge`), using
`AmcpTransport`/`OscTransport` with real sockets. Protocol logic SHALL NOT run in
the browser, and `@cg/caspar-client` SHALL NOT be imported by the renderer or the
browser platform layer.

The bridge SHALL connect to a CasparCG server from a connection config (AMCP
host/port + OSC bind). In Phase 2 this is integration-tested **only against
`tools/amcp-mock`**, NOT real hardware; real redundancy/failover across two
sessions and on-hardware validation are Phase 3.

#### Scenario: Real stack runs in the bridge

- **WHEN** the bridge starts with a connection config **THEN** it drives a real
  `ServerSession` (AMCP over TCP, OSC over UDP) with `CommandQueue`, `Reconciler`,
  and `LayerManager`, and no `@cg/caspar-client` / `node:*` import crosses into
  browser code

#### Scenario: The throwaway in-memory backing is gone

- **WHEN** the bridge answers stack channels **THEN** it does so from the
  `Reconciler`, not a hand-rolled in-memory state machine

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
the bridge is running and the server is reachable. AMCP command construction
SHALL go through the command-construction seam.

#### Scenario: Take/update/out reach the server as AMCP and are acked

- **WHEN** the bridge is connected to a server and the operator issues
  take / update / out **THEN** the corresponding AMCP commands (`CG PLAY` /
  `CG UPDATE` / `CLEAR`) reach the server and are acknowledged (`2xx`)

### Requirement: Stack state updates from real OSC confirmations

The OSC firehose SHALL be consumed and reduced entirely inside the bridge
(interest → rate-limit → change-track → `Reconciler`); only reconciled
`StackItemState` deltas SHALL cross the WebSocket via `StackStateChangedChannel`.
Stack item states SHALL reflect real OSC confirmations from the server, with the
`Reconciler` as the single source of truth — not an internal state machine.
Outbound deltas SHALL be coalesced per `itemId` (last-write-wins) and SHALL NOT
be unbounded-queued.

#### Scenario: Real OSC drives stack state

- **WHEN** the server emits OSC (a layer's `foreground/producer` flips to
  `html` / `empty`) **THEN** the affected item's reconciled status updates from
  that real confirmation (e.g. `on-air` when the producer is live, `idle` when it
  empties), routed via the `LayerManager`-driven interest set — and raw OSC does
  not cross the WebSocket

#### Scenario: Outbound deltas are coalesced, not unbounded-queued

- **WHEN** OSC churns faster than the UI needs **THEN** the bridge coalesces
  pending `StackItemState` changes per `itemId` (last-write-wins) into bounded
  snapshot publishes rather than queuing every intermediate state

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

The bridge SHALL run two `ServerSession`s (A/B) under the `@cg/caspar-client`
`RedundancyAdapter`, each built from its own connection config (AMCP host/port +
OSC bind). WHEN the active (primary) server fails — per the redundancy strategy's
triggers (primary-session disconnect/degraded, the command-timeout budget, or a
5xx burst) — the adapter SHALL switch to the backup, and subsequent commands SHALL
continue to the new primary. The operator SHALL also be able to switch manually
via the `connections.failover` channel (`adapter.failover('manual')`).

`connections.health` SHALL reflect the **real** current primary, both sessions'
live states, and the last failover event — replacing the earlier mock health. The
Reconciler SHALL remain the source of truth across a switch: it consumes OSC from
the **current primary** (both sessions receive mirrored commands and OSC interest
is registered on both), so the new primary's OSC re-confirms state after failover.

The browser side and the `@cg/shared-ipc` wire SHALL remain unchanged, and the
bridge SHALL stay bound to `127.0.0.1` by default.

#### Scenario: Auto-failover on primary failure

- **WHEN** the primary server fails (its session drops/degrades) **THEN** the
  `RedundancyAdapter` switches to the backup per the configured strategy, commands
  continue to the new primary, and `connections.health` reports the new current
  primary plus a `lastFailover` event

#### Scenario: Manual failover via the channel

- **WHEN** the operator invokes `connections.failover` **THEN** the adapter performs
  a real `manual` switch to the backup, and `connections.health` reflects the new
  current primary with a `lastFailover` of reason `manual`

#### Scenario: Stack state survives the switch

- **WHEN** failover completes **THEN** the Reconciler keeps the stack state and
  re-confirms it from the new primary's OSC (no reset to a mock), with the bridge
  still loopback-bound and the browser/wire unchanged

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / keep-alive / update / stop for
HTML producers) behind a small command-construction seam, so the
on-hardware-verified sequence (ADR 0006) can be slotted in without reworking the
session / queue / reconciler. The verified sequence SHALL be established on real
CasparCG before this capability is considered complete, and ADR 0006 / Phase 4 §9
SHALL be updated with it.

In Phase 2 the seam emits an **`amcp-mock`-validated, NOT hardware-validated**
sequence: `load → CG ADD`, `take → CG PLAY`, `update → CG UPDATE`, `out → CLEAR`.
ADR 0006's candidate update verbs (`CALL "update"` / `CG INVOKE`) remain
unresolved on hardware; `amcp-mock` acks `CG UPDATE`, so Phase 2 uses it.

#### Scenario: The update sequence can change without reworking the stack

- **WHEN** the verified AMCP update sequence is determined on real hardware
  (Phase 3) **THEN** it is applied at the command-construction seam without changes
  to `ServerSession` / `CommandQueue` / `Reconciler`, and ADR 0006 is updated

#### Scenario: The Phase-2 sequence is marked mock-validated

- **WHEN** the seam is consulted **THEN** code and spec clearly mark the Phase-2
  command sequence as `amcp-mock`-validated and NOT yet hardware-validated

### Requirement: The single-file HTML exporter is a shared, browser-importable package

The scene → self-contained-HTML single-file export SHALL live in one shared,
browser-tier package (`@cg/single-file-export`) consumed by BOTH the Designer and
the Runtime — exactly one exporter and one runtime bundle, no per-app copy. The
package SHALL contain no Node-only APIs that would break browser bundling. This is
the architectural precondition for the bridge to obtain render HTML (B-038
Phase 2+); extracting it SHALL NOT change the produced HTML.

#### Scenario: One exporter, both apps

- **WHEN** the Designer's export feature and the Runtime both need the single-file
  HTML **THEN** they import the same `@cg/single-file-export` package (one
  exporter, one bundle), and both build green

#### Scenario: Extraction preserves byte-identical export output

- **WHEN** the Designer exports a composition after the extraction **THEN** the
  produced HTML is byte-identical to before — same base64-inlined fonts and images,
  same IIFE runtime, same scene literal — as proven by the existing single-file
  export unit tests and the D-019 export E2E
