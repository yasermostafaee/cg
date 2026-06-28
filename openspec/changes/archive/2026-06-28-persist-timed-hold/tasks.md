# Tasks — persist the timed hold (B-032)

## 1. Designer — author a stored holdMs

- [x] Add a `holdMs` control to `PlayoutSection` (shared `RealtimeNumberInput`, ms)
      writing `designerStore.setPlayout({ holdMs })`, shown only for a TIMED hold
      under `auto-out` / `loop-cycle` (`showHoldMs`).
- [x] Update the section note + the lifecycle hint (`holdMs` is authored here now;
      `repeat` stays a preview override).
- [x] Confirm no schema change (the optional `playout.holdMs` already exists) and no
      runtime/exporter code change (both already honor a stored `holdMs`).

## 2. Tests

- [x] `packages/vcg-format/tests/playout-metadata.test.ts`: `buildPlayoutMetadata`
      bakes a stored `holdMs` for content-less `auto-out` AND `loop-cycle` (not 0).
- [x] Designer E2E (`content-less-timed-hold.spec.ts`): the inspector `holdMs`
      control appears, persists across a mode round-trip, and is hidden for `manual`.
- [x] Keep the `content-less-timed-hold` runtime guards + the preview E2E.

## 3. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/designer`,
      `@cg/vcg-format`, and `@cg/template-runtime` (turbo `--force` once).
- [x] `pnpm test:e2e` (the new + preview specs on the built `dist/`).
- [x] `pnpm openspec validate persist-timed-hold --strict`.
- [x] Conventional commit + push; set B-032 `[~]` and note the change dir. Do NOT
      archive (the user confirms after merge).
