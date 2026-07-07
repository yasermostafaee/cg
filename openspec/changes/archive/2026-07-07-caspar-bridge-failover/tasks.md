# Tasks — Caspar bridge Phase 3a: real redundancy / failover (C-001)

Scope: failover ONLY, integration-tested against TWO `tools/amcp-mock` instances.
On-hardware AMCP-sequence validation is Phase 3b (separate). Browser + wire UNCHANGED.

## 1. Two-session redundancy (`CasparRuntime`)

- [x] Replace the single `ServerSession` with two (A/B), each from its own
      connection config, under the `@cg/caspar-client` `RedundancyAdapter` (strategy + `autoFailoverEnabled` from the config). Do NOT reimplement the adapter.
- [x] Route all AMCP through `adapter.send(line, opts)` (strategy-aware fan-out;
      drives the auto-failover triggers).
- [x] Feed the Reconciler OSC from the **current primary** only; register OSC
      interest on BOTH sessions so confirmations pass the filter across a switch.
- [x] `start()` starts both sessions; `stop()` stops both. `whenServerHealthy`
      waits for BOTH healthy.

## 2. Real health + failover

- [x] `health()` builds `ConnectionHealth` from the adapter: real current primary,
      both session states, and `lastFailover` (from the adapter's
      `failover-complete` event). Subscribe `adapter.on('health' | 'failover-complete')`
      → `healthChanged`.
- [x] `failover()` (the `connections.failover` channel) is now async and performs a
      real `adapter.failover('manual')`, returning the new primary.

## 3. Tests (two `amcp-mock` instances)

- [x] Auto-failover: boot mocks A + B, both healthy; kill primary A → assert the
      adapter switches to B, a subsequent command reaches B (acked), and
      `health.currentPrimary === 'B'` with a `lastFailover` event.
- [x] Manual failover: both healthy; call `runtime.failover()` → assert
      `currentPrimary` flips to B, `health.lastFailover.reason === 'manual'`, and a
      command continues to B.
- [x] Keep the existing single-server integration test (Phase 2) green against the
      two-session wiring (it runs A + B both pointing at one mock pair).

## 4. Gate

- [x] Full green gate (uncached at least once via `turbo --force`) for
      `@cg/caspar-bridge`, `@cg/runtime`, `@cg/shared-ipc`: format:check + typecheck + lint + test + build.
- [x] `openspec validate caspar-bridge-failover --strict`.
- [x] Conventional commit + push; verify remote head. C-001 stays `[~]` (Phase 3b
      remains). No PR (await review).
