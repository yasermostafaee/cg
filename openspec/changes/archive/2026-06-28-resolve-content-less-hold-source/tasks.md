# Tasks — resolve a content-less content-driven hold to timed (B-032 ext)

## 1. Shared schema

- [x] `@cg/shared-schema` `hasEffectiveHoldDrivers(root, compositions)` — own + nested
      ticker/sequence/countdown with `drivesHold !== false` (recurse containers; cycle-guarded).

## 2. Runtime

- [x] `scopeHasEffectiveHoldDrivers(scope)` (FieldScope mirror) + `effectivePlayoutFor` resolves
      `content-driven` → `timed` when no effective drivers (at the boundary, not in the coordinator).

## 3. Exporter

- [x] `buildPlayoutMetadata` applies the same resolution so the baked metadata matches on-air.

## 4. Designer UI

- [x] `PlayoutSection` `holdSourceEff` uses `hasEffectiveHoldDrivers` (drivesHold-aware), so the
      holdMs control shows for a content-less / fully-excluded content-driven comp.

## 5. Tests

- [x] Runtime: content-driven + content-less `auto-out` and `loop-cycle` hold ≈ `holdMs` (not ~0);
      already-timed regression + nested-only-stays-content-driven covered by existing tests.
- [x] Exporter: a content-less content-driven hold bakes timed (no `holdSource`) + `holdMs`; a
      WITH-driver hold still bakes `content-driven` (updated the existing tests to add a real driver).
- [x] Designer E2E: deleting the only content leaves a content-driven hold that resolves to timed →
      the holdMs control appears (no trap).

## 6. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for every touched workspace (turbo
      `--force`).
- [x] Designer E2E for the new + existing content-less specs.
- [x] `pnpm openspec validate resolve-content-less-hold-source --strict`.
- [ ] Conventional commit; keep B-032 `[~]` and **UNPUSHED** (the user reviews before push). Do NOT
      archive.
