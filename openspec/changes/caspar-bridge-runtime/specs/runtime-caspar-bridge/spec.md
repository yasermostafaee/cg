# runtime-caspar-bridge (C-001 — Phase 2: real caspar-client stack backing)

## MODIFIED Requirements

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
