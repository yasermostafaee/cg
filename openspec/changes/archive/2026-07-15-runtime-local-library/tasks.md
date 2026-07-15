# Tasks — browser-local template library (B-085)

## 1. Recon (done)

- [x] 1.1 Confirm `WebSocketRuntime.#invoke` blanket-rejects every channel when
      `#status !== 'live'` (the transport guard).
- [x] 1.2 Confirm bridge `templateImport`/`templateList`/`templateRemove` have NO `#linkDown()`
      and issue NO AMCP verb (Tier-B, process-local; `caspar-runtime.ts`).
- [x] 1.3 Confirm `#retained` + `#resync` is the retain-and-redeliver-on-reconnect mechanism to
      generalize.
- [x] 1.4 Confirm NO browser-local persistence exists for templates today; the SPA only caches
      `templates.list()` in React state.
- [x] 1.5 Learn `@cg/storage` (`Workspace` = OPFS/directory/memory; `MemoryWorkspace` for tests;
      `openOpfsWorkspace`) and how the Designer builds a store on it (`ProjectStore`).
- [x] 1.6 Confirm `IdSchema = z.string().min(1)` → percent-encode ids for filenames.
- [x] 1.7 Confirm `@cg/storage` is already a runtime dependency.

## 2. LibraryStore (browser-local persistence)

- [x] 2.1 `apps/runtime/src/platform/library/LibraryStore.ts` — `Map<id,{template,html}>` backed
      by a `Workspace`: `hydrate` / `list` / `get` / `entries` / `import` / `delete` /
      `remove(id, referencedCount)`. Percent-encode ids for the `library/<enc(id)>.{json,html}`
      paths.
- [x] 2.2 `apps/runtime/src/platform/library/workspace.ts` — `initRuntimeWorkspace()`: OPFS
      (`openOpfsWorkspace('runtime')`) with `MemoryWorkspace` fallback; memory under `CG_E2E`.
- [x] 2.3 Unit tests (MemoryWorkspace): import→list/get; persist→new store→hydrate→still listed;
      remove unreferenced ok / referenced refused / unknown refused; percent-encoded ids
      round-trip. (`tests/LibraryStore.test.ts`, 7 tests.)

## 3. WebSocketRuntime — templates.\* → local store + reconcile

- [x] 3.1 Constructor option `library?: LibraryStore` (default
      `new LibraryStore(new MemoryWorkspace())`).
- [x] 3.2 `templates.list/get` → `store.list()/get(id)` (never round-trips, never rejects).
- [x] 3.3 `templates.import` → `store.import` then, if `live`, `await #invoke(import)`
      (swallow a non-disconnect delivery failure — retained + reconciled later). Return
      `{ registered: true, templateId }`.
- [x] 3.4 `templates.remove` → live: `#invoke(remove)` authoritative, on `ok` `store.delete`;
      disconnected: `store.remove(id, #referencedCount(id))`.
- [x] 3.5 Remove `#retained`; `#resync` re-delivers `store.entries()` (deliveries BEFORE the
      snapshot pulls, exactly once) — generalized reconcile. Also: `#resync(reconnected)` now
      runs on the FIRST connect too (delivery only), so a boot-disconnected offline import is
      delivered on the first successful connect.
- [x] 3.6 `#lastStack` cached on stack publish / resync pull / `stack.snapshot` resolution;
      `#referencedCount(id)` counts it.

## 4. Boot wiring

- [x] 4.1 `createRuntimeBridge.ts` (live path): `initRuntimeWorkspace()` →
      `new LibraryStore(ws)` → `await hydrate()` → inject into `WebSocketRuntime`. Test-mode /
      mock path unchanged (no workspace).

## 5. Readers wired to local state / made resilient

- [x] 5.1 `useTemplateIndex.ts` — dropped the `if (link === 'disconnected') return` early-return
      (the join is local now); names resolve offline.
- [x] 5.2 `Inspector.tsx` — added a rejection handler to the `templates.get` `.then` (no
      unhandled rejection) and fall back to local/inferred fields.
- [x] 5.3 `LibraryPanel.tsx` — verified NO change needed (list/import/remove are local); library
      survives disconnect + reload via the platform layer.

## 6. Stack-row REMOVE consistency + copy

- [x] 6.1 `StackRow.tsx` — gate REMOVE on `linkDown` (disabled + offlineReason tooltip), matching
      PLAY/UPDATE/CLEAR. Rationale: stack is bridge-owned (out of scope to move local). Updated
      `stackRow.gating.dom.test.ts` (it pinned the old "REMOVE stays available offline").
- [x] 6.2 Confirmed the "Not sent to CasparCG" copy is only surfaced for on-air commands now
      (accurate); no change needed (see design Decision 7).
- [x] 6.3 (post-visual-confirmation UX) A Load refusal surfaces via the existing command TOAST,
      not inline in the library row. `AsyncButton` gains an optional `onError` sink (routes the
      message to a handler + returns to idle, no inline span); the Library Load button passes
      `reportCommandError`. Placement-only; wording unchanged; other buttons keep inline errors.
      Tests: `asyncButton.test.ts` (2 routing cases), `libraryLoadError.dom.test.ts`.

## 7. Tests (hard — storage + connection transitions)

- [x] 7.1 Import with the bridge WS DOWN → template registers locally, appears in `list`,
      survives. (`tests/local-library.offline.test.ts`.)
- [x] 7.2 Library survives disconnect (doesn't empty) and survives reload (hydrate).
      (`tests/LibraryStore.test.ts` reload case + offline reads.)
- [x] 7.3 On (re)connect, the local library's templates are delivered to the bridge (asserted) —
      `reconnect-redelivery.test.ts` stays green + new first-connect delivery test.
- [x] 7.4 On-air commands (take/update/out) STILL refused while disconnected — R-006 refusal
      tests + `WebSocketRuntime.test.ts` + `createRuntimeBridge.test.ts` stay green (+ FROZEN
      assertion in the new offline test).
- [x] 7.5 Inspector schema falls back to local (no unhandled rejection) when reading offline.
      (`tests/inspector.offlineSchema.dom.test.ts`.)
- [x] 7.6 Conflict policy: local-wins (removed-offline template not resurrected; imported-offline
      delivered on connect).
- [x] 7.7 `mock-bridge-parity.test.ts` stays green (method tree unchanged).

## 8. Docs + gate

- [x] 8.1 Engine/README doc-sync — N/A: no engine's structure/contracts/extension points changed
      (the change is in the runtime PLATFORM layer, not a doc-synced engine — canvas / timeline /
      state / template-runtime). The `window.cg` contract is unchanged.
- [x] 8.2 `pnpm gate` GREEN (turbo typecheck/lint/test/build --force = 79 tasks + format:check +
      openspec 39/39 strict, incl. `change/runtime-local-library`). Runtime suite: 230 passed.
- [x] 8.3 `pnpm gate:e2e` GREEN on WINDOWS (22/22 e2e tasks; runtime e2e passed). ⚠️ Windows-only
      is NOT authoritative per the CI rule — a Linux/WSL E2E pass is still needed before "done".
- [x] 8.4 PAUSE for product-owner visual confirmation (offline import works; library survives
      reload) before commit. ← confirmed by PO; shipped as PR #330 (merged to `main`).
