# Per-element timing overrides in preview — Phase 1: tickers (D-102)

## Why

The preview's session-only timing override is PER-SCOPE: `PlayoutOverride` / `TimingOverride` carry
one `tickerRepeat` / `tickerBoundary` per scope, and the UI reads only the scope's FIRST ticker
(`firstTickerOf`). Two tickers in one composition share that single slot, so an operator can't tune
them independently — and the override silently applies to every ticker in the scope.

## What Changes (Phase 1 — tickers only)

- **Override model:** ticker timing moves from per-scope to PER-ELEMENT, keyed by `elementId`.
  `PlayoutOverride` (runtime) and `TimingOverride` (designer) drop `tickerRepeat` / `tickerBoundary`
  and gain `tickers?: Record<elementId, { repeat?, cycleBoundary? }>`. The per-scope lifecycle
  (`mode` / `holdSource` / `holdMs` / `repeat`) is unchanged.
- **UI:** `PreviewScopeTiming` enumerates EVERY ticker of a scope (recursing containers) and renders
  one row per ticker (by name), each with its own repeat + cycle-seam, nested under its scope node;
  the scope's lifecycle controls stay above. (`PreviewTimingControls` drops the per-scope ticker
  rows.)
- **Runtime:** each ticker's override is applied to THAT ticker's own driver — `wireScope` resolves
  the override by `t.element.id` (the `WiredSubtree` already holds one `TickerDriver` per element).
- **Session-only:** the stored template is never changed. A scope with exactly one ticker behaves
  as today (no regression).

## Impact

- Affected specs: **designer-playout-lifecycle** (ADDED — per-element ticker timing in preview);
  **designer-ticker-element** (MODIFIED — the per-scope ticker-override clauses become per-ticker).
- Affected code: `@cg/template-runtime` (`types.ts` `PlayoutOverride`, `runtime.ts` `wireScope`),
  `@cg/designer` (`PreviewTimingControls`, `PreviewScopeTiming`, `PreviewModal`). `preview.ts`
  forwards `scopeOverrides` unchanged (the `tickers` map rides along).
- **No schema change** (the preview override is session-only, never stored). Phase 2 (sequences +
  countdown clocks) is a later change.
