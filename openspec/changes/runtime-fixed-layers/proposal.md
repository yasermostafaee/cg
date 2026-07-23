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

**The design phase is closed** (all four owner decisions answered and encoded);
**implementation lands in four stages** — see the STAGE MAP at the top of `tasks.md`:
stage 1 = install config + the LayerManager fixed mechanism (pure logic, no UI/channels,
no on-air change); stage 2 = channels + the fixed-bank panel; stage 3 = the one-action
import+create+load chain; stage 4 = the restore branch, `restore-blocked`, and the
fixed-row Clear carve-out. The design documents in this change dir:

- `design.md` — the deliverable: the ownership-composition resolution order, the OSC-silence
  decision for fixed rows, the pinned mechanism's exact code seam, the restore/adopt-in-place
  branch vs #368, the config shape and live-change rules, the row verb surface, multi-station
  behavior (incl. the same-fixed-bank deployment invariant), and forward-compatibility with
  R-023 / R-024 / C-002 — each decided with the code cited. The four product/on-air calls
  this design originally flagged (a1/b1/d1/e1) were ANSWERED by the owner on 2026-07-23 and
  are encoded in place, under one named principle (conflicts resolve loudly at config/startup
  time; b1 is the deliberate on-air-recovery exception).
- `specs/runtime-fixed-layers/spec.md` — a delta encoding what is settled, including the
  four resolutions.
- `tasks.md` — the full implementation plan, ALL tasks unchecked; implementation is a later PR.

R-021 stays `[ ]` in `docs/prd/runtime.md`, with a Notes pointer at this change dir.

## Impact

- **Affected specs (when implemented):** new capability `runtime-fixed-layers`.
- **Affected code (when implemented — none in this PR):**
  `packages/caspar-client/src/layers/layer-manager.ts` (fixed-slot mechanism beside the
  existing pinned set), `tools/caspar-bridge` (install config + validation, `#slotForRestore`
  branch, fixed-row channels, orphan-sweep exclusion), `@cg/shared-ipc` (fixed-layer channels),
  `apps/runtime` renderer (fixed rows, one `rowAction` declaration point, import+load chain).
