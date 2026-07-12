# Tasks — owned-slot-occupancy-warning (B-056)

## 1. Artifacts

- [x] Diagnosis + Option-B decision (loud-fail rejected), detection /
      surface / resolve mechanisms, unknown-occupancy decision, and
      accepted residuals in `design.md`.
- [x] `pnpm openspec validate owned-slot-occupancy-warning --strict` passes.

## 2. Red-first integration test (`tools/caspar-bridge`)

- [x] Failing test against amcp-mock (seen red — 5/5 failed on the missing
      surface): mirror pair, server A's AMCP a dead port (link down) while a
      real mock emits A's OSC to the bridge's A-ingest; foreign producer
      planted on the target layer via a second AMCP client;
      `autoFailoverEnabled: false`; load → (a) the owned-slot warning
      surfaces naming channel-layer + item, (b) load behavior UNCHANGED
      (accepted, slot bound, own `CG ADD` reached the backup).
- [x] Every socket/port (incl. the OSC observer probe) released
      deterministically in `afterEach` — no leaked UDP ports (the real past
      cause of "flaky" CI).

## 3. `@cg/shared-ipc` — channels

- [x] `OwnedOccupancyWarningSchema` (channel, layer, itemId, producer,
      since); `layers.owned-occupancy` (pull) +
      `layers.owned-occupancy-changed` (publish); exports; schema tests.
      R-009's `layers.*` channels untouched.

## 4. `tools/caspar-bridge` — detection + resolve

- [x] `#adoptLayer` returns its already-computed primary-landing result
      (`{adopted}`) — return value ONLY; adopt-CLEAR mechanism, `#adopted`
      gate, and `load()`'s proceed stay behaviorally identical (the single
      permitted reconnect-reconciliation touch).
- [x] `load()`: after adopt + remove-race guard, before `#sendAdd` — if not
      adopted AND the current primary's occupancy tap fresh-reports the
      slot non-empty, raise the warning (observed-occupancy only).
- [x] Warning store + `ownedOccupancy()` + `ownedOccupancyChanged` emitter
      (publish on change only).
- [x] Resolve sites: one helper (`#markAdoptedOnPrimary`) marks adoption AND
      resolves (adopt / out / remove / `clearLayer` on `ok && onPrimary`);
      `remove()` resolves unconditionally on deallocation; `setConfig` drops
      all warnings (old-server knowledge). Take resolves NOTHING. Never
      auto-clear.
- [x] Routes (`layers.owned-occupancy`) + `owned-occupancy-changed` in
      `wirePublishes`.
- [x] Resolve tests: out while primary down → persists; revived primary +
      out → resolves; remove while primary down → resolves; take → does NOT
      resolve; unknown occupancy → no warning.

## 5. `apps/runtime` — the surface

- [x] Contract (`runtime-bridge.ts`) + `WebSocketRuntime` +
      `createRuntimeBridge` mock wrapper; `MockRuntime` parity (empty set;
      out/remove resolve; `CG_E2E_OWNED_OCCUPANCY`-guarded seed) + parity
      tests.
- [x] `useOwnedOccupancy` hook; `OrphanLayersBanner` renders the owned-slot
      strip as a distinct variant — names channel-layer + item, remedy
      text, NO Clear button; R-009 rows unchanged.
- [x] jsdom: owned row named (layer + item), no Clear control, null when
      both sets empty, R-009 rows unaffected.
- [x] Playwright e2e (`owned-occupancy.spec.ts`): seeded warning → banner
      names 1-10 + item, no Clear button → Remove of the item resolves →
      idle-quiet.

## 6. Gate

- [x] caspar-bridge suite green in ISOLATION (20 files / 76 tests) and
      under the full parallel `pnpm test` (both mandatory), plus full
      uncached gate (`turbo run typecheck lint test build --force`, 79/79) + root `pnpm format:check`.
- [x] `pnpm test:e2e` (full run: designer 199 passed; runtime forced
      uncached, 21 passed including `owned-occupancy.spec.ts`).
- [x] `pnpm openspec validate --all --strict` (34 passed).

## 7. Wrap-up

- [x] PRD `docs/prd/bugs-runtime.md` B-056 → implemented +
      mock/integration-validated; live smoke recorded as PENDING hardware
      (mirror pair, primary AMCP down with backup up, foreign graphic via a
      2nd AMCP client, Load onto that layer → warning names channel-layer +
      item; restore primary / Out the item → resolves). Cross-refs B-053,
      reconnect-reconciliation, R-009, C-011 kept.
- [x] GUARDED pre-archive shared-spec ordering check PASSED (re-verified
      this session): the held pair's owned requirement headings (AMCP seam,
      Template resolution is validated, Live connection never silently
      downgraded, bridge retains template HTML, Playout verbs prescriptive,
      browser re-delivers on reconnect) are untouched; this change's deltas
      are ADDs of two brand-new headings only → archives
      ordering-independent of that pair.
- [x] Conventional commits, push, PR, verify remote.
