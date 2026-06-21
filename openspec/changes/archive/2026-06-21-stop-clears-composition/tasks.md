# Tasks — Stop = CLEARED terminal (D-085)

## 1. Spec

- [x] 1.1 `## ADDED Requirement` on `designer-playout-lifecycle`: "Stop settles into a CLEARED
      terminal state" (hide + halt; immediate when no outro; visibility not destroy; clean
      re-play; parent dominates a longer child outro) with a scenario per clause.

## 2. Unit tests (`@cg/template-runtime` `tests/stop-cleared.test.ts`) — the real deliverable

- [x] 2.1 text/ticker: Play → crawl → Stop → `body.cg-pending`, node mounted, `clock.pending()`
      → 0, paint frozen across an advance.
- [x] 2.2 clock: Play → tick → Stop → hidden, mounted, halted, time frozen across 10s of advance.
- [x] 2.3 sequence: Play → rotate → Stop → hidden, mounted, halted, frozen.
- [x] 2.4 repeater: Play (row tickers crawl) → Stop → hidden, rows mounted, every row driver
      halted via the cascade.
- [x] 2.5 nested composition instance: parent Stop → the child's content is hidden, its node
      mounted, its driver halted.
- [x] 2.6 clean re-play: Stop → Play → `cg-pending` cleared, a frame is scheduled again.
- [x] 2.7 outro timing: with an outro the clear is DEFERRED until it completes; with none it is
      immediate; the node is never destroyed (still mounted).

## 3. Runtime fix — ONLY if a 2.x test exposes a driver whose `stop()` doesn't cancel its loop

- [x] 3.1 None required — all four driver kinds already halt cleanly (`clock.pending()` → 0 after
      settle in every case). No `runtime.ts` change; `remove()`/`removed` left untouched.

## 4. E2E (`apps/designer/tests/e2e/stop-cleared.spec.ts`)

- [x] 4.1 A content-driven element visible during play is GONE (stage hidden) after Stop and
      re-appears on re-play.
- [x] 4.2 A nested child's content is GONE after the parent Stop.

## 5. Docs

- [x] 5.1 `packages/template-runtime/README.md`: document the terminal model (Stop = play OUT then
      hide + halt, settled + re-playable; Remove = destroy).
- [x] 5.2 `docs/prd/designer.md`: file D-085 (`## [~] …`) with What / Why / Acceptance.

## 6. Gate

- [x] 6.1 Full green gate (all turbo tasks + unit) for the touched workspaces, uncached once —
      17/17 turbo tasks green (`--force`); 7 new stop-cleared unit tests pass; 497 designer units.
- [x] 6.2 `pnpm test:e2e` green — 60 passed (incl. the 2 new D-085 specs).
- [x] 6.3 `pnpm openspec validate --all --strict` valid (24/24); `pnpm format:check` clean.
- [x] 6.4 Conventional commit(s) on `feat/D-085-stop-cleared`. (Do not push.)
