# Tasks — the stack survives a bridge-process restart (B-092)

## 1. Recon (done)

- [x] 1.1 The stack lives ONLY in the bridge's in-memory `Reconciler` (`items` Map) plus
      `#slots`/`#loaded`/`#adopted`/`#positions` in `caspar-runtime.ts`. Nothing persists it.
- [x] 1.2 `WebSocketRuntime.#resync` (`:280-296`) re-delivers the browser-local library, then
      re-PULLS the stack snapshot (`:301-307`) and pushes it — from an empty fresh bridge that is
      `[]`, which blanks every row. `stack.*` are bare pass-throughs; `#lastStack` serves only
      B-085's offline remove-reference check.
- [x] 1.3 The naive fix is FORBIDDEN: `load()` → `#adoptLayer` (`:517`) → `#adopted` empty on a
      fresh process → `#send(#builder.out(slot))` (`:1267`) — a hard CLEAR that destroys a LIVE
      producer on a bridge-only restart (off-air flash). Same code family as B-056.
- [x] 1.4 The occupancy tap resets on session resync and repopulates during the RESYNCING drain, so
      it is warm at the `to === 'healthy'` transition — the exact point B-086 samples it
      (`:334-339`). `transitionTo` emits `state-change` BEFORE `emit('healthy')`, so the restore
      decision runs before `session.on('healthy')` clears `#loaded`.
- [x] 1.5 `beginResync`/`endResync` are never called by `caspar-runtime`, so the Reconciler is never
      suspended there — a restore-time `applyIntent` is applied, not queued.

## 2. Schema + wire

- [x] 2.1 `@cg/shared-schema`: add `RetainedStackItemSchema` (itemId, templateId, fields, `played`,
      optional slot, optional position) next to `StackItemStateSchema`; export the type.
- [x] 2.2 `@cg/shared-ipc`: add the `stack.restore` channel (request `{ items }`, response
      `{ restored, skipped }`).

## 3. caspar-client primitives

- [x] 3.1 `Reconciler.restoreItem(...)`: seed an item record from retained intent WITHOUT an
      operator intent — `played` drives `intentStatus`/`ackedStatus` so a restored on-air row is a
      faithful reconstruction (settled, not a spinner) and a restored loaded row rests at `loaded`.
      Returns `null` when the item already exists (never clobber a live bridge's own state).
- [x] 3.2 `LayerManager.reserve(slot, templateType)`: allocate an EXACT slot when free (restore must
      land on the layer the producer is actually on), returning false when taken.

## 4. Bridge — restore + the occupancy-aware decision

- [x] 4.1 `CasparRuntime.restore(items)`: skip items the reconciler already holds and items with an
      unregistered template; reserve the retained slot (fall back to normal allocation); seed the
      reconciler (`restoreItem`), `#slots`, `assignSlot`, OSC interest and `#positions`; queue the
      item in `#pendingRestore`; publish. Sends NOTHING to CasparCG here.
- [x] 4.2 Decide adopt-vs-re-ADD where occupancy is knowable: at the `to === 'healthy'` transition
      (before `reconcileOnReconnect`, reusing B-086's occupancy sample) and immediately inside
      `restore()` when the primary session is ALREADY healthy (late page reload).
- [x] 4.3 Occupied branch: mark `#adopted` for the layer and send NOTHING — resumed OSC re-derives
      ON AIR. Silent branch: `applyIntent load` + `assignSlot` + `#sendAdd` (no adopt-CLEAR), so the
      item rests at `loaded`. All record mutations are synchronous so `reconcileOnReconnect` (which
      runs straight after) sees a consistent reconciler.
- [x] 4.4 Route `stack.restore` in `bridge.ts` (route-coverage guard).

## 5. Browser — retention + reconcile-on-connect

- [x] 5.1 `StackRetentionStore` (OPFS-backed via `@cg/storage`, mirroring `LibraryStore`): hydrate,
      `items()`, `mirror(snapshot)`. Ordered single-file persistence; a corrupt read degrades to
      empty rather than throwing.
- [x] 5.2 `WebSocketRuntime`: mirror every published/pulled snapshot into the store; suppress
      mirroring during the restore window so a transient empty snapshot can never wipe the
      retention.
- [x] 5.3 `#resync`: after the library re-delivery and BEFORE the snapshot re-pull, deliver the
      retained stack intent via `stack.restore`; a failure is surfaced and leaves retention intact.
- [x] 5.4 Boot wiring (`createRuntimeBridge`): construct + hydrate the OPFS-backed store alongside
      the library store.

## 5b. Browser — the stack is VISIBLE while the bridge is down (owner-found gap)

Visual confirmation on real CasparCG passed for the restart scenarios, but a hard refresh DURING a
bridge outage still showed an empty stack: the retention was hydrated at boot but only ever read as
the reconnect delivery set. Display-only fix, no bridge/schema/wire change.

- [x] 5b.1 `WebSocketRuntime.stack.snapshot()` serves `#retainedProjection()` while the link is not
      `live`, instead of rejecting. Sends nothing; decides nothing.
- [x] 5b.2 The projection is HONEST: `played → 'unverified'` (B-086/B-087's muted "WAS ON AIR",
      never the broadcast red), `!played → 'loaded'` (not an air claim; what B-082 leaves an item at
      with no reachable server), `pending: false` throughout.
- [x] 5b.3 `useBridgeSnapshot` gains an opt-in `pullWhileDisconnected`; ONLY `useStack` passes it —
      health/lock/config still must not be asked while down (R-006).
- [x] 5b.4 The projection also seeds `#lastStack`, so B-085's offline refuse-while-referenced check
      counts the visible retained rows (a cold boot previously counted zero).
- [x] 5b.5 Tests: cold boot with a dead bridge shows the rows; offline rows never read
      `on-air`/`playing`; zero frames sent while disconnected and on-air verbs still refused; the
      authoritative snapshot replaces the offline view on reconnect; offline template-remove is
      refused as in-use.

## 6. Tests

- [x] 6.1 Bridge-ONLY restart (CasparCG alive, layer occupied): the restored item keeps ON AIR and
      **NO CLEAR is issued for that layer** — the key broadcast-safety invariant.
- [x] 6.2 Bridge + CasparCG restart (layer empty/silent): the restored item returns as `loaded` via
      a safe re-ADD.
- [x] 6.3 Invariant: a layer the occupancy tap reports occupied at restore time has its adopt-CLEAR
      suppressed.
- [x] 6.4 Browser-local: the stack survives a bridge restart — the retained intent is re-delivered
      before the re-pull and the item list does NOT go empty; a failed restore preserves retention.
- [x] 6.5 FROZEN: on-air refusal (R-006) intact; B-085's library still works; B-086's
      CasparCG-death path unaffected; the ORDINARY load path still adopt-CLEARs.
- [x] 6.6 Suite hygiene: caspar-bridge tests green isolated AND under the full parallel `pnpm test`;
      ports/sockets released in `afterEach`.

## 7. Gate

- [x] 7.1 `pnpm gate` green (typecheck + lint + test + build + format), uncached test run.
- [x] 7.2 `pnpm gate:e2e`.
- [x] 7.3 `pnpm openspec validate runtime-stack-survives-bridge-restart --strict`.
