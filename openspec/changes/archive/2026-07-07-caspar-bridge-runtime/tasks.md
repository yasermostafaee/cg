# Tasks — Caspar bridge Phase 2: real caspar-client stack backing (C-001)

Scope: backing swap inside `tools/caspar-bridge`. Browser wire + `WebSocketRuntime`
UNCHANGED. Integration-tested ONLY against `tools/amcp-mock`. Redundancy/failover

- on-hardware validation are Phase 3.

## 1. AMCP command-construction seam (ADR 0006)

- [x] `src/command-builder.ts` — a `CommandBuilder` producing AMCP lines for a
      slot: `load → CG ADD`, `take → CG PLAY`, `update → CG UPDATE`, `out → CLEAR`,
      using `quote()` from `@cg/caspar-client` for escaping. Clearly marked
      **amcp-mock-validated, NOT hardware-validated**; ADR 0006 candidate update
      verbs (`CALL`/`CG INVOKE`) documented as the Phase-3 slot-in.

## 2. Real backing (`CasparRuntime`)

- [x] `src/caspar-runtime.ts` — owns `ServerSession` + `Reconciler` +
      `LayerManager` + `CommandBuilder`. `start()` connects the session; subscribe
      `session.osc 'events' → Reconciler.applyOsc`; subscribe `Reconciler
'item-changed' / 'item-removed' → coalesced publish`.
- [x] Stack ops drive the Reconciler + AMCP: - `load`: `applyIntent(load)` → `LayerManager.allocate` →
      `Reconciler.assignSlot` → `osc.interest.add` → `CG ADD` → ack →
      `applyAck`. - `take`: `applyIntent(take)` → `CG PLAY` → ack → `applyAck`. - `update`: `applyIntent(update)` → `CG UPDATE` → ack → `applyAck`. - `out`: `applyIntent(out)` → `CLEAR` → ack → `applyAck`. - `remove`: `applyIntent(remove)` → `CLEAR` + `LayerManager.deallocate` +
      `osc.interest.remove`. - `snapshot`: `Reconciler.snapshot()`.
- [x] Non-playout channels (lock / templates / audit / settings / update gate /
      config) remain simple in-memory stubs; `health` reflects the session state.
      `failover` is a Phase-3 stub.
- [x] Coalesce outbound `StackItemState` deltas per `itemId` (last-write-wins) on
      a bounded flush — never unbounded-queue.
- [x] Delete `src/runtime-backing.ts`.

## 3. Bridge wiring (`src/bridge.ts`)

- [x] `createBridge({ host?, port?, connection? })` — construct + `start()` the
      `CasparRuntime` from the connection config; keep loopback bind by default.
- [x] Make request-frame dispatch `await` async handlers (stack ops await acks).
- [x] Expose on the handle what tests need: the runtime + its bound OSC port +
      a `whenServerHealthy()` (or equivalent).
- [x] `bin/caspar-bridge.mjs` + CLI flags for the connection (AMCP host/port, OSC
      port). `@cg/caspar-client` added as a dependency.

## 4. Tests (`tools/caspar-bridge/tests`)

- [x] amcp-mock integration: boot `amcp-mock` + the bridge wired to it; assert
      (a) take/update/out reach the mock as AMCP and are acked, and (b) emitted
      OSC (`foreground/producer` html→empty) drives reconciled stack state — proving
      OSC is the source of truth, not an internal state machine.
- [x] Keep/adjust the existing bridge frame tests (envelope round-trip, loopback
      bind, unknown-channel error) against the real backing.
- [x] `command-builder` unit test (the exact AMCP strings + escaping).

## 5. Gate

- [x] Full green gate (uncached at least once via `turbo --force`) for
      `@cg/caspar-bridge`, `@cg/runtime`, `@cg/shared-ipc`: format:check +
      typecheck + lint + test + build.
- [x] `openspec validate caspar-bridge-runtime --strict`.
- [x] Conventional commit + push; verify remote head. C-001 stays `[~]`. No PR
      (await review).
