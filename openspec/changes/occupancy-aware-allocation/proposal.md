# Occupancy-aware layer allocation: an ordinary Add never destroys another system's output (C-014)

## Why

R-015 (#365) made it impossible for the operator to clear a video layer — the affordance is
gone and the bridge refuses `layers.clear` with `foreign`. But the back door stayed open: an
ordinary "Add item" still destroys foreign producers silently. `LayerManager.allocate` hands
out the lowest free layer in a template-type range consulting ONLY its own bookkeeping, and
`load()`'s adopt-CLEAR then wipes whatever sits there before the ADD — with no warning at
all (B-056 warns only when the adopt-CLEAR FAILS; when it succeeds the foreign producer is
simply gone). Layer 1 is safe only because it is outside every range — luck of the
numbering, not protection.

## What Changes

Allocation reuses R-015's discriminator: a layer whose tap shows a FRESH non-`html`
observation on the current primary is quarantined out of the allocatable pool — never
allocated, never adopt-CLEARed. `html`-occupied and genuinely-free layers allocate exactly
as before (the hot path and R-009/B-039 adoption semantics are untouched).

- The bridge reconciles a quarantine set against fresh non-html occupancy at every sweep
  tick AND at allocation time (point-in-time freshness), releasing quarantine when the
  foreign producer leaves. The state freezes while the primary is unhealthy (the same
  absence-of-knowledge discipline as R-009's warnings) and resets on `setConfig` (old-server
  knowledge, like `#adopted` and the orphan set).
- `LayerManager`'s purpose-built quarantine machinery (the C-010 dead-wiring family) is
  WIRED UP for exactly what it was designed for — see `design.md` for what fits and what
  deliberately stays unwired.
- A range exhausted (partly or wholly) by foreign producers refuses the load legibly:
  `errorCode: 'no-layer-foreign-occupied'` (distinct from the plain `no-layer`), carried on
  the `stack.load` response (B-070 precedent) so the Library's Load toast can say what
  actually happened. Never a silent CLEAR of a foreign layer.
- **Blind tap fails OPEN for allocation** — the direction is deliberately opposite to
  R-015's clearing refusal, and `design.md` carries the full justification. Pinned by a
  test so the decision cannot drift.

## Impact

- **Affected specs:** `runtime-caspar-bridge` (the prescriptive playout-verbs requirement's
  adoption/allocation rules).
- **Affected code:** `@cg/caspar-client` (`LayerManager` — quarantine accessor, out-of-layers
  diagnostics), `tools/caspar-bridge` (quarantine reconciliation, `load` refusal codes),
  `@cg/shared-ipc` (`stack.load` response `errorCode`), `apps/runtime`
  (`errorCodeMessage` wording).
