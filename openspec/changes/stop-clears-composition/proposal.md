# Stop = CLEARED terminal (D-085)

## Why

When the operator Stops a composition, broadcast (CasparCG) semantics are that the graphic plays
its OUT and then is CLEARED from the stage — content and all — not frozen on its last frame. The
runtime already does this: the root scope's settle adds `body.cg-pending`
(`.cg-stage { visibility: hidden }`) and `onRootSettled` halts every driver (ticker / clock /
sequence / repeater) by cancelling its animation frame; nested children are hidden and cascaded
with it. D-087 made this observable in the Designer preview (the broadcast modal no longer lifts
`cg-pending`).

The behaviour is correct but it is **not pinned**. A future driver or lifecycle change could
silently regress it — e.g. a new content driver whose `stop()` forgets to cancel its loop would
keep ticking under the hidden stage, or a refactor could turn the settle into a frozen-last-frame
hold. This change LOCKS the STOP = CLEARED contract with an explicit spec requirement and
behaviour tests, per driver kind, so the regression can't pass the gate.

The recon (`design.md`) confirmed Decision A: keep the existing VISIBILITY clear (hide + halt) —
do NOT add a true-unmount-on-stop path. Unmount is the distinct CG REMOVE / `remove()` path and
is left untouched (mirrors CasparCG STOP vs REMOVE).

## What Changes

- A `## ADDED Requirement` on `designer-playout-lifecycle`: "Stop settles into a CLEARED terminal
  state" — stage hidden + every content driver halted (no further frame), content-driven elements
  and nested children go away, no per-element opacity-out; immediate when there is no outro;
  VISIBILITY mechanism (nodes stay mounted), distinct from `remove()`; re-play restarts cleanly;
  the parent lifecycle dominates a longer child outro on the global clear.
- Unit tests (`@cg/template-runtime` `tests/stop-cleared.test.ts`): for EACH driver kind (ticker,
  clock, sequence, repeater) — Play, settle on Stop, assert the driver schedules NO further frame
  (`clock.pending()` → 0 and the paint does not change as the clock advances), the stage is hidden
  (`body.cg-pending`), and the nodes stay MOUNTED (guard against an accidental unmount). Plus a
  nested-child case, a clean-re-play case, and an outro-timing case (clear deferred until the
  outro completes; immediate when none).
- E2E (`apps/designer/tests/e2e/stop-cleared.spec.ts`): a content-driven element visible during
  play is GONE (stage hidden) after Stop and re-appears on re-play; a nested child's content is
  GONE after the parent Stop.
- Doc-sync: `packages/template-runtime/README.md` documents the terminal model (Stop = play OUT
  then hide + halt, settled and re-playable; Remove = destroy).
- `docs/prd/designer.md`: file D-085 (it was only in `docs/ROADMAP.md`).

## Impact

- Affected specs: **designer-playout-lifecycle** (ADDED requirement).
- Affected code: **none expected** — the per-driver-kind unit tests confirmed every driver's
  `stop()` already cancels its loop, so NO `runtime.ts` change was required (the runtime fix was
  pre-authorised only if a test exposed a gap; none did). The change is spec + tests + docs.
- `remove()` / the `removed` state is intentionally untouched.
- Risk: low. The terminal lifecycle is shared by the preview and BOTH exporters, so the full gate
  - `pnpm test:e2e` are required even though only tests/spec/docs changed.
