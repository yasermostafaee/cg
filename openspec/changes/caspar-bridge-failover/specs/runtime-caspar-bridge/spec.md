# runtime-caspar-bridge (C-001 — Phase 3a: real redundancy / failover)

## MODIFIED Requirements

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
