# Tasks — per-instance hold overrides (D-112)

## 1. Schema (`@cg/shared-schema`)

- [x] Add `holdOverrides: z.record(z.string(), z.boolean()).optional()` to `CompositionElementSchema`
      (`elements.ts`). Keep `CURRENT_SCHEMA_VERSION = 1` (additive, optional). No migration.

## 2. Runtime (`@cg/template-runtime`)

- [x] `FieldScopeChild` (`types.ts`) += `holdOverrides?: Readonly<Record<string, boolean>>`;
      `scene-builder.ts` pushes `element.holdOverrides` when building the child.
- [x] `ScopeNode` (`runtime.ts`) += `contentDrivers: ContentDriver[]` (every hold-eligible own driver,
      UNFILTERED, `{ id, drivesHold, whenComplete }`) and `holdOverrides?` (set by the instancing
      parent after `wireScope`). Build `contentDrivers` alongside the `hold*` arrays.
- [x] Replace the non-coordinator recursion with override-aware `nestedContentWait(node)`:
      `node.contentDrivers` filtered by `holdOverrides[id] ?? drivesHold`, recursing instance children
      (coordinator → `whenSettled()`, else recurse). `ownContentWait()` UNCHANGED (child's own hold).
- [x] Verify the override affects ONLY the parent aggregation (content still starts/runs; child's own
      coordinator hold + visibility unchanged).

## 3. Designer store (`apps/designer`)

- [x] `setHoldOverride(instanceId, nestedElementId, drives: boolean | undefined)` — recursive patch on
      the `type:'composition'` element; set or delete the key; empty record ⇒ `undefined`.

## 4. Designer UI (`PlayoutSection.tsx`)

- [x] `nestedHoldGroupsOf` returns per immediate instance: direct drivers
      `{ id, name, type, drivesHold, infinite, override, effective }`, recursive EFFECTIVE
      count/infiniteCount (overrides applied per level), the instance `key`, and `deeperCount`.
- [x] Render writable checkbox rows (checkbox = effective value) that write the per-instance override
      via `setHoldOverride` (clearing when the value matches the child's own default); keep the
      drill-in; show the D-111 `InfiniteWarn` on effective-infinite rows; the prominent all-infinite
      alert aggregates EFFECTIVE drivers (own + nested).

## 5. Tests

- [x] Schema round-trip (`packages/vcg-format/tests`): `holdOverrides` survive `.vcg` pack/unpack +
      appear in single-file HTML export.
- [x] Runtime (`packages/template-runtime/tests`): a parent excludes a nested infinite element via the
      instance override → parent closes on the finite nested content; a SECOND instance of the same
      child is unaffected (still holds until stop).
- [x] Designer E2E: nested rows are writable; toggling one instance off doesn't change a second
      instance; the infinite warning shows/clears with the effective value.

## 6. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for every touched workspace (turbo
      `--force` once).
- [x] `pnpm test:e2e` (new spec + adjacent playout specs on built `dist/`).
- [x] `pnpm openspec validate per-instance-hold-overrides --strict`.
- [x] Conventional commit + push + verify remote head; D-112 `[~]`, D-111 marked superseded. Do NOT
      archive (user confirms after merge).
