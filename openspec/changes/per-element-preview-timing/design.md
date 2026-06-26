# Design — Per-element ticker timing in preview (D-102 Phase 1)

## Root cause (verified)

`PlayoutOverride.tickerRepeat` / `tickerBoundary` is ONE slot per scope; `runtime.ts` applies it to
EVERY ticker in the scope; the UI's `firstTickerOf` reads only the scope's first ticker. Two tickers
⇒ one shared slot, so they can't be tuned separately.

## Model: a per-element map

Replace the two per-scope fields with `tickers: Record<elementId, { repeat?, cycleBoundary? }>` on
BOTH `PlayoutOverride` (runtime, `types.ts`) and `TimingOverride` (designer,
`PreviewTimingControls.tsx`). Keyed by `elementId` — stable, unique, and already the address the
`WiredSubtree`'s per-element drivers use. The lifecycle axes (`mode` / `holdSource` / `holdMs` /
`repeat`) stay PER-SCOPE — Phase 1 is tickers only.

## Runtime application

`wireScope` already maps `scope.tickers` to one `TickerDriver` each. For each, look up
`scopeOverride?.tickers?.[t.element.id]` and apply its `repeat` / `cycleBoundary` (falling back to
the element's authored values) to THAT driver. Two tickers are two independent drivers — each honors
its own override. `effectivePlayoutFor` (the lifecycle layering) is untouched.

## UI

`PreviewScopeTiming` enumerates ALL tickers of a scope (recursing containers, returning
`{ id, name, repeat, cycleBoundary }`), renders the scope's lifecycle controls
(`PreviewTimingControls` — its per-scope ticker rows removed) then one per-ticker row beneath, by
name. The per-ticker `onChange` deep-merges into the scope override's `tickers` map (editing ticker
B never clobbers ticker A); the modal's existing shallow per-scope merge then carries it.

## No new wire format

`preview.ts` forwards `scopeOverrides` verbatim — the `tickers` map rides along; no parsing change.
Session-only: nothing is written to the stored scene.

## No-regression

A scope with one ticker gets one row, addressed by its id — identical behavior to the old
first-ticker path. Existing per-scope LIFECYCLE overrides (`mode`/`holdMs`/`repeat`) are unchanged.
