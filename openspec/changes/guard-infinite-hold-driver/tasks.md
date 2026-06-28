# Tasks — guard against an infinite-repeat hold driver (D-111)

## 1. Designer — flag infinite-repeat hold drivers

- [x] `contentHoldElementsOf`: add `infinite` (`repeat === 'infinite'` for ticker / sequence; a
      countdown clock is always `false`).
- [x] `nestedHoldGroupsOf`: `countIn` returns `{ count, infiniteCount }`; each group reports
      `infiniteCount` (recursive, cycle-guarded — unchanged otherwise).
- [x] Checklist: per-row "loops forever" flag when `drivesHold && infinite` (own) and
      `infiniteCount > 0` (nested, read-only).
- [x] Prominent `Callout variant="danger"` when EVERY driver (own + nested) is infinite.
- [x] No runtime / schema change; reuse the existing recursive walks + the existing exclude
      checkbox (warn-only — see design.md).

## 2. Tests

- [x] Designer E2E (`guard-infinite-hold-driver.spec.ts`): an infinite-repeat ticker shows the
      per-row + prominent warning; excluding it clears both; a finite countdown clock shows no
      warning (no false positive).

## 3. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/designer` (turbo
      `--force` once).
- [x] `pnpm test:e2e` (the new spec + adjacent playout specs on the built `dist/`).
- [x] `pnpm openspec validate guard-infinite-hold-driver --strict`.
- [x] Conventional commit + push; set D-111 `[~]` and note the change dir. Do NOT archive (the
      user confirms after merge).
