# Tasks — occupancy-aware allocation (C-014)

## 1. LayerManager (the dead wiring, wired)

- [x] 1.1 `quarantined()` accessor (the bridge's reconciliation needs to enumerate the set).
- [x] 1.2 `OutOfLayersError` carries `quarantinedInRange` (how many in-range slots the scan
      skipped as quarantined) so the load refusal can say WHY the range is exhausted.

## 2. Bridge reconciliation

- [x] 2.1 `#reconcileForeignQuarantine()`: quarantine fresh non-`html` occupied layers
      (excluding owned/pinned slots), release quarantined layers whose foreign observation
      is gone; only while the primary session is healthy (frozen otherwise); one stderr
      line per newly quarantined layer.
- [x] 2.2 Hooked at the sweep tick AND at `#allocate` (point-in-time freshness); quarantine
      dropped wholesale on `setConfig` beside `#adopted`/orphans/owned-occupancy.
- [x] 2.3 `load()` refusal codes: `no-layer-foreign-occupied` when the exhausted range had
      quarantined slots, plain `no-layer` otherwise — on the ack AND the response.

## 3. Contract + wording

- [x] 3.1 `@cg/shared-ipc` `stack.load` response gains optional `errorCode` (B-070 pattern).
- [x] 3.2 `errorCodeMessage`: operator wording for `no-layer` and
      `no-layer-foreign-occupied`.

## 4. Tests

- [x] 4.1 Bridge integration (`occupancy-aware-allocation.integration.test.ts`), wire
      asserted via recorded CLEARs/ADDs: foreign skip (no CLEAR for the foreign coord,
      video untouched); html-occupied allocates + adopts as before; `decklink` fail-safe;
      blind-tap fail-open PINNED; fully-foreign range refuses `no-layer-foreign-occupied`
      with zero wire traffic; release re-allocates after the foreign producer leaves.
      Cleanup in `afterEach`; green isolated AND under full parallel `pnpm test`.
- [x] 4.2 `errorCodeMessage` unit coverage for the two new codes.
- [x] 4.3 Branch coverage for the reconciliation's own guards: a foreign producer on an OWNED
      layer is NOT quarantined (B-056's territory) and the owning item keeps its slot — the
      release path can never deallocate a layer a live item still holds; and quarantine FREEZES
      while the primary is unhealthy (absence of knowledge never releases it).

## 5. PRD

- [x] 5.1 `docs/prd/caspar.md`: C-014 → `[~]`, change dir noted; number re-verified against
      merged main AND sibling branches immediately before commit.

## 6. Gate

- [x] 6.1 `pnpm openspec validate occupancy-aware-allocation --strict` — green; re-run by the
      pre-push gate as part of `validate --all --strict` (37 passed, 0 failed).
- [x] 6.2 `pnpm gate` green (uncached) — `Tasks: 82 successful, 82 total`,
      `Cached: 0 cached, 82 total`; green again on the foreground pre-push run.
- [x] 6.3 `pnpm gate:e2e` with no bridge/mock/dev server competing for CPU — green: Runtime 36
      passed, Designer 216 passed, 22/22 tasks, with ports 5280/5250/5174/4000/4321 verified
      free of any bridge, mock or dev server immediately before the run. (Unrelated review
      agents were running; that load can only produce a false RED, never a false green, so it
      does not weaken this pass.) No new E2E: the operator-visible delta is a toast string for
      a refusal the offline MockRuntime cannot produce — it has no layer model; the
      AsyncButton→toast plumbing is already covered by B-070's tests, and the bridge-side truth
      is integration-tested per the R-009 precedent.

## 7. Outstanding — owner on-air validation (NOT done)

- [ ] 7.1 On real CasparCG, the two checks this change's risk actually lives in: (a) CLEAR a
      foreign layer, wait for the tap to age the observation out, then re-Add — the layer must
      return to the allocatable pool (the only exercise of the newly-wired `deallocate()`; a
      pool leak stays invisible until Adds start refusing); and (b) with an item on a layer,
      kill the bridge, PLAY a foreign producer onto that same layer, restart the bridge — the
      item must land elsewhere and the foreign producer must survive (the B-092 restore
      narrowing flagged in #368).
