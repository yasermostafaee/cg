# Fixed operator layers — ownership composition and restore semantics (R-021, DESIGN ONLY)

## Why

With multiple Runtime stations driving one CasparCG, a known layer must always be manageable
from any station — "layer 72 is the clock, whoever loaded it". The dynamic stack cannot promise
that; fixed, aliased slots can (the Cinegy operating model). R-021's Notes name the structural
risk that makes this a design-first item: the fixed range's Clear carve-out is a THIRD ownership
notion beside the producer-kind discriminator (R-015/C-014/R-009) and C-015's Live Source layer
ledger, and the three MUST compose — plus a restore rule (#368's quarantine fall-through) that
is exactly what fixed slots must forbid.

## What Changes

**Nothing in this PR beyond documents.** This change dir is the DESIGN PHASE of R-021:

- `design.md` — the deliverable: the ownership-composition resolution order, the OSC-silence
  decision for fixed rows, the pinned mechanism's exact code seam, the restore/adopt-in-place
  branch vs #368, the config shape and live-change rules, the row verb surface, multi-station
  behavior, and forward-compatibility with R-023 / R-024 / C-002 — each either DECIDED with the
  code cited, or stated as a recommendation flagged **OWNER DECISION**.
- `specs/runtime-fixed-layers/spec.md` — a delta encoding ONLY what is settled; nothing that
  hangs on an open owner decision.
- `tasks.md` — the full implementation plan, ALL tasks unchecked; implementation is a later PR.

R-021 stays `[ ]` in `docs/prd/runtime.md`, with a Notes pointer at this change dir.

## Impact

- **Affected specs (when implemented):** new capability `runtime-fixed-layers`.
- **Affected code (when implemented — none in this PR):**
  `packages/caspar-client/src/layers/layer-manager.ts` (fixed-slot mechanism beside the
  existing pinned set), `tools/caspar-bridge` (install config + validation, `#slotForRestore`
  branch, fixed-row channels, orphan-sweep exclusion), `@cg/shared-ipc` (fixed-layer channels),
  `apps/runtime` renderer (fixed rows, one `rowAction` declaration point, import+load chain).
