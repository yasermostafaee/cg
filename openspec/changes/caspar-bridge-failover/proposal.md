# Caspar bridge — Phase 3a: real redundancy / failover (C-001)

## Why

Phase 2 put the real `@cg/caspar-client` stack in the bridge, but over a **single**
`ServerSession` — `failover()` was a stub and `ConnectionHealth` was mocked. C-001's
last acceptance bullet — _"WHEN primary fails THEN failover switches to backup per
the redundancy strategy"_ — needs the real two-session redundancy. Phase 3a delivers
it.

Scope is **failover ONLY**, integration-tested against `tools/amcp-mock` (TWO mock
instances). The on-hardware AMCP-sequence validation (ADR 0006) is a separate
deliverable (Phase 3b) and is NOT attempted here. The browser side and the
`@cg/shared-ipc` wire stay **unchanged**.

## What Changes

- **`tools/caspar-bridge` (`CasparRuntime`)** — replace the single `ServerSession`
  with a **`RedundancyAdapter` over two `ServerSession`s (A/B)**, each built from its
  own connection config (AMCP host/port + OSC bind). Uses the existing
  `@cg/caspar-client` `RedundancyAdapter` — not reimplemented.
- **Real failover path** — commands now `send()` through the adapter (strategy-aware
  fan-out; this also drives the auto-failover triggers: primary session
  disconnect/degraded, command-timeout budget, 5xx burst). On a primary failure the
  adapter switches to the backup per the strategy; subsequent commands continue to
  the new primary.
- **Real health** — `connections.health` is built from the adapter: the actual
  current primary, both sessions' live states, and the **last failover** event
  (replacing the Phase-1/2 mock health). The `connections.failover` channel now
  drives a **real** manual switch (`adapter.failover('manual')`).
- **State survives failover** — the Reconciler (source of truth) is fed OSC from the
  **current primary** only; because both sessions receive mirrored commands, the new
  primary's OSC re-confirms state after a switch (the mandatory RESYNCING already in
  `ServerSession` covers reconnects). OSC interest is registered on both sessions so
  confirmations pass the filter regardless of which is primary.
- Bridge stays **`127.0.0.1`-bound**; offline/mock + DISCONNECTED behaviours intact.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED): the failover requirement is now satisfied by
  real two-session redundancy — auto (per strategy triggers) and manual — with health
  reflecting the real current primary + last failover, and stack state surviving the
  switch.

## Impact

- `@cg/caspar-bridge` (`CasparRuntime` rewired; `failover()` now async + real). No
  change to `@cg/shared-ipc` or `@cg/runtime` source (wire + browser unchanged;
  re-gated to prove no regression). `@cg/caspar-client` consumed, unchanged.
- Tests: a **two-`amcp-mock`** integration test proving — WHEN the primary fails THEN
  failover switches to backup per the strategy, commands continue to the new primary,
  and published health reflects the switch — covering **both** auto-failover (trigger
  thresholds) and the **manual** `connections.failover` path.
- This change **closes the C-001 failover acceptance bullet**, but C-001 stays `[~]`
  until Phase 3b (on-hardware AMCP-sequence validation) lands. Do NOT flip to `[x]`.
