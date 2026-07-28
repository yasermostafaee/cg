# One layer surface — declared rows replace the dynamic stack (R-028, DESIGN ONLY)

## Why

The owner has seen R-021 stage 3 running (#419) and **rejected its core premise**. R-021 was
designed as a fixed-layer bank running BESIDE the dynamic stack — two surfaces, two ownership
models, one operator. The owner wants ONE surface: every on-air item sits on a DECLARED row, and
automatic layer allocation stops being the operating model. The reference product is Cinegy CG.

This supersedes R-021's _framing_, not its plumbing. It is a decision already taken, recorded here
so the spec — not a prompt — carries it.

The deployment model is what forces the rest: **ONE bridge, MANY browsers.** Two operators on
different machines, or the same operator on a different browser tomorrow, all connect to the same
bridge. An item another browser loaded is therefore **not foreign** — the bridge loaded it and
knows its template. And THREE writers touch CasparCG layers, not two: our Runtime (from any
browser), the PLAYOUT system (which binds templates to playlist videos and sends `CG ADD`/`PLAY`
directly, written outside this project), and anything else (another CG system, a manual AMCP
command).

## What Changes

Design only. No production code, no UI edits, no channel changes in this PR.

- `design.md` — the deliverable. It resolves, with the code cited and verified rather than
  assumed: where the live state ACTUALLY lives today (this is the finding that sizes the whole
  change); whether layers 90–99 are really free; when NEXT can be enabled and what is missing to
  send it; how playout-owned rows are declared and why detection is impossible; verb density
  across 30 rows through the ONE `rowAction` declaration point; the local-file consequence of
  "pick a `.vcg` each time" under many browsers; the fate of every piece of dynamic machinery
  (`allocate`, the R-009 sweep, R-015's refusal, B-092/#368's restore fall-through); migration;
  and the effect on R-021's unfinished stage 4.
- `specs/runtime-unified-layer-rows/spec.md` — the delta encoding what is settled.
- `tasks.md` — the full implementation plan, ALL tasks unchecked.

Two owner calls are flagged in `design.md` as OPEN and blocking implementation (not this
design): **(o1)** where template files live under many browsers, and **(o2)** whether the
`CG NEXT` wire gap is in scope. Everything else is decided.

### This is a NEW change, not a revision of `runtime-fixed-layers` — justification

`runtime-fixed-layers` has **four stages already merged** (stage 1, 2a, 2b and stage 3 via #419)
and one still open (stage 4: the restore branch, `restore-blocked`, the fixed-row Clear
carve-out). Revising it would rewrite the recorded intent of work that has already shipped, and
would leave stage 4's tasks ambiguous about which model they serve. So:

- `runtime-fixed-layers` stays as it is and **completes stage 4 on its own terms**. Its stage-4
  work is not superseded — it becomes MORE load-bearing (see `design.md` §k).
- This change owns the PRESENTATION model and the decisions that follow from it, and cites
  R-021's plumbing (`bindFixed`, the `fixedLayers.load` channel, the exact-slot import chain) as
  its foundation rather than re-specifying it.

## Impact

- **Affected specs (when implemented):** new capability `runtime-unified-layer-rows`; MODIFIED
  `runtime-ui` (the Stack and Library panels stop being the operator's primary surface);
  touches `runtime-template-library` if (o1) moves the library server-side.
- **Affected code (when implemented — NONE in this PR):** `apps/runtime` renderer (one row list
  replacing the stack + library panels, settings gains the candidate-layer table),
  `@cg/shared-ipc` (a row-state channel carrying template identity; possibly a `NEXT` verb),
  `tools/caspar-bridge` (declared-row config, `reservedLayers` wired for the playout split,
  the fate of the R-009 sweep), `packages/caspar-client` (`LayerManager.allocate`'s remaining
  callers), `tools/caspar-bridge/src/command-builder.ts` (no `CG NEXT` exists today).
- **Prerequisite promoted:** C-015's `reservedLayers` stops being distant — it is how
  playout-owned rows are declared, and it is `[]` at both call sites today.
