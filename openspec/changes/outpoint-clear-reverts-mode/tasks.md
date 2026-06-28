# Tasks — clearing the out-point reverts the mode (D-113)

## 1. Store

- [x] `setLifecycle(null)` (`document.ts`) reverts `auto-out` / `loop-cycle` → `manual` in the SAME
      `set()` (atomic, one undo); preserves the rest of the playout; no-op when already manual; no
      auto-restore on re-add.

## 2. Tests

- [x] Store/unit (`tests/store-lifecycle.test.ts`): clear in auto-out → manual (rest preserved);
      loop-cycle → manual; manual → unchanged (no spurious write); one undo restores out-point + mode.
- [x] Designer E2E (`outpoint-clear-reverts-mode.spec.ts`): clear in auto-out → mode shows manual +
      re-adding does not restore it; clear in loop-cycle → manual.

## 3. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/designer` (turbo `--force`).
- [x] `pnpm test:e2e` (the new spec).
- [x] `pnpm openspec validate outpoint-clear-reverts-mode --strict`.
- [ ] Conventional commit + push + verify remote head; D-113 `[~]`. Do NOT archive.
