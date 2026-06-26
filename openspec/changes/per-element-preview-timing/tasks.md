# Tasks — Per-element ticker timing in preview (D-102 Phase 1)

## 1. Override model (per-element)

- [x] 1.1 `@cg/template-runtime` `types.ts` — `PlayoutOverride` drops the per-scope `tickerRepeat` /
      `tickerBoundary` and gains a per-element `tickers` map (ticker `elementId` → its own `repeat` /
      `cycleBoundary`). Exports the new `TickerTimingOverride` shape.
- [x] 1.2 `@cg/designer` `PreviewTimingControls.tsx` — `TimingOverride` mirrors the same change; the
      per-scope ticker rows are removed (they move to per-ticker rows).

## 2. Runtime application

- [x] 2.1 `runtime.ts` `wireScope` — each `scope.tickers` entry resolves its own override by element
      id and applies it to THAT driver; the effective repeat/boundary is stamped on the band as
      `data-cg-ticker-repeat` / `data-cg-ticker-boundary` (operator + test visibility).
- [x] 2.2 Unit test (`tests/ticker-runtime.test.ts`) — two tickers in one scope with a per-element
      override on each: each band shows its OWN effective timing; an override on one leaves the other
      authored; no override = both authored; the stored scene is untouched.

## 3. UI — one row per ticker

- [x] 3.1 `PreviewScopeTiming.tsx` — `firstTickerOf` becomes `tickersOf` (every ticker, recursing
      containers). Each scope renders its lifecycle controls then one per-ticker row (name + repeat +
      cycle-seam), nested via `PreviewTimingControls` children; the per-ticker change deep-merges into
      the scope override's `tickers` map. New `PreviewTickerTimingRow` component.
- [x] 3.2 `PreviewModal.tsx` — no structural change (the per-ticker patch is a full `tickers` map, so
      the existing per-scope shallow merge carries it; `scopeOverrides` is sent as today).
- [x] 3.3 `preview.ts` — no change (forwards `scopeOverrides` verbatim; the `tickers` map rides
      along). Confirmed.

## 4. Tests + E2E

- [x] 4.1 Designer UI test (`preview-scope-timing.test.ts`) — a scope with two tickers yields two
      ticker entries (id + name + authored timing); a scope with none yields an empty list.
- [x] 4.2 E2E (`per-element-preview-timing.spec.ts`) — two tickers: the panel shows one cycle-seam
      row per ticker; set them differently; each preview band shows its OWN effective seam while the
      authoring canvas (the stored scene) is unchanged.

## 5. Gate

- [x] 5.1 Full green gate (turbo `--force`): `@cg/template-runtime` + `@cg/designer` `format:check` +
      `typecheck` + `lint` + `test` + `build`, plus the E2E.
