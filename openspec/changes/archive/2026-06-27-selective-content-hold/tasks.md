# Tasks — select which content drives the content-driven hold (D-107)

## 1. Schema — optional `drivesHold` (non-breaking)

- [x] Add `drivesHold: z.boolean().optional()` to `TickerElementSchema`,
      `ClockElementSchema`, and `SequenceElementSchema` (`elements.ts`), each with
      a doc comment (HOLD-only; absent ⇒ participates; countdown-only for clocks).
- [x] `tests/elements.test.ts`: per element — absent ⇒ `undefined` (round-trip
      unchanged), explicit `false`/`true` preserved + through the Element union.
- [x] No schema-version bump / migration (additive, backward-compatible).

## 2. Runtime — filter the hold wait

- [x] In `wireScope`, collect `holdTickers` / `holdCountdowns` / `holdSequences`
      as each driver is built — `drivesHold !== false`, with countdowns also
      filtered to countdown-mode clocks.
- [x] `ownContentWait` builds its `Promise.all` from the `hold*` subsets; empty ⇒
      `null` (zero-length). `startOwnContent` / `stopScopeContent` still start/stop
      ALL content (drop the now-unused `scopeCountdowns`).
- [x] Confirm the D-104 `contentTreeWait` aggregation flows through `ownContentWait`
      (no coordinator-rule change needed).
- [x] New `tests/selective-content-hold.test.ts`: finite SELECTED + infinite
      EXCLUDED ticker → hold COMPLETES; same infinite INCLUDED → holds until
      `stop()` (regression); default-no-flag → finite drives; all-excluded →
      zero-length; mixed countdown SELECTED + ticker EXCLUDED.

## 3. Designer — the Playout checklist

- [x] `contentHoldElementsOf(scene)` + `disambiguate` in `PlayoutSection.tsx`:
      list tickers / sequences / countdown clocks (recursing containers), excluding
      wall/countup clocks; show a hint when content is nested-only.
- [x] Render the checklist (native checkbox per row, accessible name
      `"<name> drives the hold"`) when the hold is content-driven (`hasContent`,
      non-`manual` mode, hold source `content-driven`).
- [x] `setElementDrivesHold(elementId, drivesHold)` store action (recursive
      `patchDrivesHold` over the active layers) so grouped content is reachable.
- [x] Designer E2E (`selective-content-hold.spec.ts`): checklist lists content +
      toggling persists; wall clocks never appear, a countdown does.

## 4. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for
      `@cg/shared-schema`, `@cg/template-runtime`, and `@cg/designer`
      (turbo `--force` once).
- [x] `pnpm test:e2e` (the new spec + adjacent playout specs pass on built `dist/`).
- [x] `pnpm openspec validate selective-content-hold --strict`.
- [x] Conventional commit + push; set D-107 `[~]` and note the change dir. Do NOT
      archive (remind the user).
