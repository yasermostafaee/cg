# Tasks — surface nested-composition hold-driving content (D-108)

## 1. Designer — the read-only nested surface

- [x] Add `nestedHoldGroupsOf(scene)` to `PlayoutSection.tsx`: walk the active
      layers (recursing groups, NOT nested comps) to find IMMEDIATE `composition`
      instances; for each, count hold-driving items (`ticker` / `sequence` /
      countdown-`clock`, `drivesHold !== false`) reachable through the referenced
      composition — recursing its groups and its own deeper nested instances,
      cycle-guarded. Keep instances with a count greater than zero.
- [x] Render a READ-ONLY nested section in `ContentHoldChecklist`: one shared
      `Button` (`variant="bare"`) row per instance — drill-in `Icon`, name
      (disambiguated), and count — with an accessible name that says "open to
      choose which content closes the graphic". No checkbox, no `drivesHold` write.
- [x] Activating a row calls `designerStore.setActiveComposition(compositionId)`.
- [x] Compose own checklist + nested section + the existing empty hint (own +
      nested, hint only when both are empty).

## 2. Tests

- [x] Designer E2E (`surface-nested-hold-content.spec.ts`): a parent nesting a
      composition that holds a ticker shows the read-only nested row + count;
      activating it drills into the child; excluding the child's ticker (in the
      child's own checklist) removes the row.

## 3. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/designer`
      (turbo `--force` once).
- [x] `pnpm test:e2e` (the new spec runs against the built `dist/`).
- [x] `pnpm openspec validate surface-nested-hold-content --strict`.
- [x] Conventional commit + push; set D-108 `[~]` and note the change dir. Do NOT
      archive (the user confirms after the PR merges). Merge the D-107
      `selective-content-hold` archive PR before archiving this one.
