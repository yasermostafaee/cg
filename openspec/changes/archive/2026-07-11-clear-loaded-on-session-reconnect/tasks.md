# Tasks — clear-loaded-on-session-reconnect (B-054)

## 1. Implementation

- [x] 1.1 `CasparRuntime.#wireAdapter`: per declared session, subscribe to
      `'healthy'` and wholesale-clear `#loaded`; synchronous handler; staleness
      guard (`this.#sessions[label] === session`) so a torn-down era's session
      never touches current bookkeeping. `#adopted` untouched.

## 2. Tests — new coverage

- [x] 2.1 Integration (B-054 repro, MUST fail pre-fix): single-server; load +
      take on air; settle CG ADD resolution; restart the mock on the SAME
      AMCP + OSC ports (per-instance layer state → genuinely empty server);
      wait healthy; take → wire trace shows `CG ADD` before `CG PLAY` on the
      new instance, producer `html`, `onAir` true — and NO `CLEAR` (pins
      `#adopted` retained + harmless).
- [x] 2.2 Integration (transient blip): `closeAllAmcpConnections()` on a
      surviving mock; after reconnect the bridge sent nothing beyond
      VERSION/INFO; next take re-ADDs onto the live layer and renders.
- [x] 2.3 Integration (wholesale rule): two mocks (A primary, B backup),
      item on air on both; restart B only; after B healthy, take → B's
      producer recreated and on air, A still on air (benign stage-replace).
- [x] 2.4 Integration (survival + dispose): after `setConfig` re-point, a
      restart of the NEW server still heals the next take; after manual
      `failover()`, a restart still heals; after `runtime.stop()`, a mock
      restart attracts no zombie session (`amcpClientCount` stays 0).
- [x] 2.5 Unit (caspar-client, trigger precision): degraded→healthy recovery
      emits `'state-change'` only — never `'healthy'`.

## 3. Keep-green + gate

- [x] 3.1 B-039 (`playout-cycle`), reconnect-reconciliation, B-044
      (`pending-update-completion`), B-053 (`false-onair-first-load`),
      failover, single-server, orphan-layers, reconfigure suites stay green
      unmodified (the fix only fires on a completed reconnect cycle; initial
      connect clears an empty set).
- [x] 3.2 Full uncached green gate (`turbo --force`): format:check, typecheck,
      lint, test, build for touched workspaces; `pnpm test:e2e`.
- [x] 3.3 caspar-bridge suite green BOTH isolated AND under the full parallel
      `pnpm test` (B-064 contention lesson).

## 4. Wrap-up

- [x] 4.1 Optional live smoke: NOT RUN — no CasparCG installation on this
      machine (explicitly optional/non-gating per the brief; the restart path
      is mock-validated by 2.1 with per-instance layer state).
- [x] 4.2 PRD: `docs/prd/bugs-runtime.md` B-054 → `[x]` with change dir +
      smoke note.
- [x] 4.3 Archive (delta is an ADDED requirement — clean of the held
      `fix-amcp-escaping-v2`/`reconnect-reconciliation` pair), prettier pass
      on `openspec/specs/**`, `pnpm openspec validate --all --strict` +
      `pnpm format:check`.
- [x] 4.4 Conventional commits, push, PR, compare URL, final report.
