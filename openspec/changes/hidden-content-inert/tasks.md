# Tasks — a hidden content element is inert (B-034)

## 1. Runtime + schema predicate

- [x] `runtime.ts` — exclude `visible === false` from `holdTickers` / `holdCountdowns` /
      `holdSequences` AND `contentDrivers` (per kind) AND `scopeHasEffectiveHoldDrivers`.
- [x] `@cg/shared-schema` `hasEffectiveHoldDrivers` — same `visible` gate.

## 2. Designer walks

- [x] `PlayoutSection.tsx` — `hasContentElement`, `contentHoldElementsOf`, `nestedHoldGroupsOf`
      exclude `visible === false`.
- [x] `PreviewScopeTiming.tsx` — `tickersOf` + the content-source check exclude `visible === false`.
- [x] Render — already `display: none` for `!visible` (no change; covered by `hide-clock-sequence`).

## 3. Tests

- [x] Runtime (`hidden-content-inert.test.ts`): a hidden infinite ticker does NOT force an infinite
      hold (resolves to timed, settles); a hidden finite driver does not gate the hold.
- [x] Designer E2E (`hidden-content-inert.spec.ts`): hiding an infinite ticker drops it from the hold
      checklist + the preview per-ticker timing list, and clears its infinite warning.

## 4. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for the touched workspaces (turbo
      `--force`).
- [x] `pnpm test:e2e` (the new spec + adjacent hide/checklist specs).
- [x] `pnpm openspec validate hidden-content-inert --strict`.
- [x] Conventional commit + push + verify remote head; B-034 `[~]`. Do NOT archive.
