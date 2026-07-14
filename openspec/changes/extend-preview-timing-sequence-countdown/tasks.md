# Tasks — D-102 Phase 2 (sequences + countdowns + repeater-stamped tickers)

## 1. Override model (@cg/template-runtime)

- [x] 1.1 `types.ts` — add `SequenceTimingOverride` (`repeat?`, `dwellMs?`) and
      `CountdownTimingOverride` (`durationMs?`); `PlayoutOverride` gains `sequences?` / `countdowns?`
      element-id maps beside Phase 1's `tickers?`. Export both from `index.ts`.

## 2. Runtime application (@cg/template-runtime)

- [x] 2.1 `sequence-driver.ts` — optional `dwellOverrideMs` that wins over the item's own `dwellMs`
      and the element's `defaultDwellMs` (bites on every item; survives a bound-list `update()`).
- [x] 2.2 `runtime.ts` — apply each sequence's override (`repeat`, `dwellOverrideMs`) to THAT
      sequence's own driver; stamp `data-cg-sequence-repeat` / `data-cg-sequence-dwell` with the
      EFFECTIVE values.
- [x] 2.3 `runtime.ts` — apply each countdown's `durationMs` override by substituting a
      `{ kind: 'duration' }` target for the clock's authored target (duration OR datetime); stamp
      `data-cg-countdown-ms`. `wall` / `countup` are untouched.
- [x] 2.4 `runtime.ts` — `wireScopeSubtree` takes an inherited per-element timing map; repeater-row
      and sequence composition-item subtrees inherit the HOST scope's maps, so a stamped element's
      driver resolves the authored element's override. LIFECYCLE axes are NOT inherited.

## 3. Preview timing panel (@cg/designer)

- [x] 3.1 `PreviewTimingControls.tsx` — `TimingOverride` gains `sequences` / `countdowns` maps;
      add `PreviewSequenceTimingRow` (passes + dwell) and `PreviewCountdownTimingRow` (duration).
- [x] 3.2 `PreviewScopeTiming.tsx` — one `contentOf` walk enumerating tickers + sequences +
      countdowns (hidden elements skipped; `wall` / `countup` excluded; duplicate names
      disambiguated); render one row per element under the scope's lifecycle controls; deep-merge
      each per-element patch into its own map.
- [x] 3.3 `PreviewScopeTiming.tsx` — the walk descends a `repeater` into its child composition
      (depth-/cycle-guarded), surfacing its content elements against the AUTHORED element id.

## 4. Tests

- [x] 4.1 Unit (`apps/designer/tests/preview-scope-timing.test.ts`) — the panel enumerates sequence +
      countdown rows and repeater-stamped tickers; `wall` / `countup` never listed; duplicate names
      disambiguated; cyclic/deep repeater references are guarded.
- [x] 4.2 Unit (`packages/template-runtime/tests`) — a sequence / countdown override drives only its
      OWN driver (others keep authored values); a dwell override wins over an item's own `dwellMs`; a
      datetime-target countdown is overridden by a duration; a repeater's stamped rows honor the
      authored element's override; the stored scene object is unchanged after a run with overrides.
- [x] 4.3 jsdom interaction (`apps/designer/tests`) — changing a sequence / countdown row's control
      patches only that element's map in the preview session override.
- [x] 4.4 E2E (`apps/designer/tests/e2e/preview-timing-phase2.spec.ts`) — a composition with a
      sequence, a countdown and a repeater-with-ticker shows all of them in the timing panel; tuning
      one affects only its own preview driver and never the stored (canvas) scene.
- [x] 4.5 Prove a test bites: reverting the tree-walk change fails the repeater-ticker test.

## 5. Gate + docs

- [x] 5.1 `pnpm --filter @cg/designer typecheck lint test build` (+ `@cg/template-runtime`) green;
      `pnpm format:check` green.
- [x] 5.2 `pnpm openspec validate extend-preview-timing-sequence-countdown --strict` green.
- [x] 5.3 `docs/prd/designer.md` — D-102 Phase 2 tracked `[~]` with the change dir noted (Phase 1's
      `[x]` + archive citation untouched).
