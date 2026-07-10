# Tasks — reconnect-reconciliation

## 1. Face 1 — browser retention + re-delivery

- [x] 1.1 `WebSocketRuntime`: retain the exact `{ template, html }` of every
      successful `templates.import`, keyed by `templateId` (replace on
      re-import; cleared on `dispose()`).
- [x] 1.2 `#resync()`: re-deliver every retained template exactly once, BEFORE
      the stack/health/lock snapshot pulls; a re-delivery failure is isolated
      (remaining re-deliveries + snapshot still run).
- [x] 1.3 Unit tests (apps/runtime): retain-on-import; re-import replaces;
      reconnect replays exactly the retained set once, before the snapshot
      re-pull (assert `templates.import` dispatches on the resync path);
      cleared on dispose; a failing re-import does not abort resync.
- [x] 1.4 Bridge-restart integration test (apps/runtime): close the bridge,
      re-create it on the SAME port (empty registry), reconnect → the bridge
      serves the template again and a load succeeds with no manual re-import.

## 2. Face 1 — bridge-side load guard

- [x] 2.1 `CasparRuntime.load()`: reject with `accepted:false` + ack error
      `unknown-template` (nothing sent to CasparCG) when the registry lacks
      the templateId.
- [x] 2.2 Update existing suites that load un-imported ids to import first;
      the serve-render "unregistered load is rejected" case now passes via the
      guard (not mock strictness).

## 3. Face 2 — lazy layer adoption

- [x] 3.1 `CasparRuntime`: `#adopted` layer set; first ADD onto a non-adopted
      layer is preceded by `CLEAR <ch>-<layer>` (non-intent seq) issued BEFORE
      `#slots.set` / `assignSlot` / `#addInterest`; any bridge-issued CLEAR
      (adopt / out / remove) marks the layer adopted. No startup CLEAR.
- [x] 3.2 Orphan integration suite (bridge→mock): session 1 load+take, kill the
      runtime (orphan survives, mock state is per-instance); session 2
      re-delivers + loads the same type → the adopt-CLEAR precedes the first
      ADD on exactly that layer; the fresh item is never polluted to `on-air`
      before take; take renders (onAir + resolved verdict).
- [x] 3.3 Regression versions of EXP-A/EXP-C: post-restart load with an empty
      registry fails LOUD via the guard (`unknown-template`) and the item
      never shows a false ON AIR from the orphan's OSC.

## 4. Mock fidelity

- [x] 4.1 `CG ADD`: URL arg → `202` immediately, async GET, per-slot verdict
      (`resolved`/`failed`) recorded and exposed on `MockHandle`; a failed
      page is observably not rendering on PLAY. Bare id → `404` (unchanged).
- [x] 4.2 `CG UPDATE` → `403` when the layer has no producer.
- [x] 4.3 amcp-mock unit/integration tests updated for the new semantics;
      B-041 decode/recording surfaces untouched.

## 5. Keep-green + gate

- [x] 5.1 B-044 badge-settle, B-040 list-field, R-003 staging, B-038
      serve-render, B-039 playout-cycle suites green under the new semantics
      (adjust assertions for adopt-CLEAR + guard + verdict where needed).
- [x] 5.2 Full uncached gate (`turbo --force`): format:check + typecheck +
      lint + test + build for every touched workspace; repo `format:check`.
- [x] 5.3 `pnpm openspec validate reconnect-reconciliation --strict`.
- [x] 5.4 Full e2e (`pnpm test:e2e`).

## 6. Part C — live validation (operator-driven, CasparCG 2.5.0) then wrap-up

- [ ] 6.1 FIRST: clean-main B-048 reproduction attempt with caspar log +
      bridge access log captured; apply the discriminator (no CG PLAY ⇒
      resolved-by-R-007; CG PLAY + GET 200 + blank ⇒ new PRD entry; reproduces
      ⇒ diagnose further). B-048's outcome does NOT block this change's own
      validation.
- [ ] 6.2 Face 1 live: import → Load+Take on air → RESTART BRIDGE (not the
      page) → Load works with NO manual re-import; access log shows the GET on
      the new port.
- [ ] 6.3 Face 2 live: kill bridge with output on air → fresh session →
      Load/Take: caspar log shows `CLEAR <ch>-<layer>` before `CG ADD`; first
      Take renders; no Update-then-Take dance; no false ON AIR before take.
- [ ] 6.4 Negative/edge: Load while disconnected → explicit rejection; import
      a CHANGED `.vcg` then bounce the bridge → the re-delivered HTML is the
      changed one; page-reload matrix behaves as scoped (reload with live
      bridge still works; both-restart needs manual re-import).
- [ ] 6.5 After PASS: PRD updates (B-038 follow-up resolved; B-048 per the
      discriminator; note build 2.5.0 `69e8ad5`; file the two follow-up
      candidates), archive per workflow (AFTER `fix-amcp-escaping-v2`, or
      re-reconcile the shared requirement text), push, compare URL.
