# Tasks — a hidden content element is inert (B-034)

## 1. Runtime + schema predicate

- [x] `runtime.ts` — exclude `visible === false` from `holdTickers` / `holdCountdowns` /
      `holdSequences` AND `contentDrivers` (per kind) AND `scopeHasEffectiveHoldDrivers`.
- [x] `@cg/shared-schema` `hasEffectiveHoldDrivers` — same `visible` gate.

## 2. Designer walks + exporter

- [x] `PlayoutSection.tsx` — `hasContentElement`, `contentHoldElementsOf`, `nestedHoldGroupsOf`
      exclude `visible === false`.
- [x] `PreviewScopeTiming.tsx` — `tickersOf` + the content-source check exclude `visible === false`.
- [x] `ExporterSingleFile.ts` — `findFiniteTicker` (the `ticker-finite-with-timed-hold` preflight)
      excludes `visible === false` (found by the adversarial audit).
- [x] Render — already `display: none` for `!visible` (no change; covered by `hide-clock-sequence`).

## 3. Tests

- [x] Runtime (`hidden-content-inert.test.ts`): a hidden infinite ticker does NOT force an infinite
      hold (resolves to timed, settles); a hidden finite driver does not gate the hold; a parent
      `holdOverrides` force-include CANNOT resurrect a hidden NESTED driver; a hidden nested driver
      does not extend the parent hold while a visible sibling does.
- [x] Designer E2E (`hidden-content-inert.spec.ts`): hiding an own infinite ticker drops it from the
      hold checklist + the preview per-ticker timing list (warning clears); a hidden NESTED driver is
      dropped from the parent's nested checklist and un-hiding restores the row + its warning.
- [x] Exporter (`exporter-single-file.test.ts`): a hidden finite ticker raises no
      `ticker-finite-with-timed-hold` preflight diagnostic.

## 4. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for the touched workspaces (turbo
      `--force`).
- [x] `pnpm test:e2e` (the new spec + adjacent hide/checklist specs).
- [x] `pnpm openspec validate hidden-content-inert --strict`.
- [x] Conventional commit + push + verify remote head; B-034 `[~]`. Do NOT archive.
