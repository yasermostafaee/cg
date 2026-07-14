# Design — Per-element sequence / countdown timing + the repeater gap (D-102 Phase 2)

## Model: two more element-id maps, identical to Phase 1

`PlayoutOverride` already carries `tickers: Record<elementId, { repeat?, cycleBoundary? }>`. Phase 2
adds, on the same object and with the same keying:

- `sequences: Record<elementId, { repeat?: number | 'infinite'; dwellMs?: number }>`
- `countdowns: Record<elementId, { durationMs?: number }>`

Nothing new is invented: the element id is already the address each per-element driver is built
under, and the maps are session-only (never stored, never exported).

## Why a `dwellOverrideMs` on the driver (not a rewritten item list)

`SequenceDriver.currentDwellMs()` is `item.dwellMs ?? defaultDwellMs`. Overriding only
`defaultDwellMs` would silently do nothing for a sequence whose items each carry an authored
`dwellMs` — a dead control. Rewriting the item list instead would be clobbered the moment a bound
`list` field calls `driver.update(items)`. So the driver takes an explicit `dwellOverrideMs` that
wins over both: `dwellOverrideMs ?? item.dwellMs ?? defaultDwellMs`. It survives `update()` and bites
on every item, which is what "preview this sequence faster" has to mean.

## Countdown: override the TARGET, not the driver's internals

`ClockDriver` already counts down to a `target` that is either `{ kind: 'duration', ms }` or
`{ kind: 'datetime', iso }`. The session override is a single `durationMs`, and the wiring simply
substitutes `{ kind: 'duration', ms }` for the element's authored target for this run. That covers
both cases with one control, and it is the ONLY way to rehearse a `datetime`-target countdown (you
cannot wait for 20:00 to arrive). `wall` / `countup` clocks are never listed — they never complete,
so they have no timing to tune (this matches the existing hold rules, where only a countdown is a
content source).

`0` means NO override (the input's clear value), so a countdown always falls back to its authored
target; a duration-target countdown's row simply starts at its authored ms.

## The repeater gap: inherit the host scope's element-timing maps into stamped subtrees

`buildRepeaterRows` builds every row from the SAME child-composition layers, so each stamped row's
ticker is the SAME authored element with the SAME `elementId`; rows are wired through
`wireScopeSubtree` under a synthetic path (`…#<repeaterId>[i]`) that no UI scope node addresses, and
row scopes are deliberately NOT in `scope.children` (that list feeds the D-025 namespace
aggregation). Two consequences:

1. **Shared, not per-row, is the only coherent control.** A per-row override is not expressible under
   element-id keying (all rows share one id); it would need scope-path keying and would produce
   controls that appear/disappear with the bound data. So the panel exposes ONE row per authored
   element inside the repeater's child composition, and it governs every stamp. (This is mechanical,
   not a product choice — see the Phase-2 brief's decision guard.)
2. **The runtime must reach the stamped drivers.** `wireScopeSubtree` takes an optional inherited
   element-timing map; the repeater-row (and sequence composition-item) call sites pass the HOST
   scope's maps down, and `wireScope` resolves each element's override as
   `{...inherited, ...overrides[path]}` per kind. Only the ELEMENT maps are inherited — the LIFECYCLE
   axes are NOT, so a row keeps its own independent lifecycle (D-030) exactly as before.

## UI enumeration

`contentOf(doc, scene)` replaces `tickersOf`: one walk returning `{ tickers, sequences, countdowns }`,
recursing containers, skipping hidden elements (B-034), skipping `wall` / `countup` clocks, NOT
descending composition instances (each is its own scope node — unchanged), and DESCENDING a
`repeater` into its child composition (depth- and cycle-guarded like the scene-builder). Names are
disambiguated per kind with Phase 1's `disambiguateNames`, so two default-named sequences are still
tellable apart.

`hasAnyContentIn` (B-031, the hold-source gate) is deliberately left alone: a repeater row is an
independent subtree root whose content does NOT drive the host scope's hold, so surfacing it as
"content" there would be wrong.

## Observability

Phase 1 stamps `data-cg-ticker-repeat` / `-boundary` with the EFFECTIVE post-override values. Phase 2
stamps the same way — `data-cg-sequence-repeat` / `data-cg-sequence-dwell` on the sequence host, and
`data-cg-countdown-ms` on a countdown clock whose effective target is a duration — so the unit and
E2E tests can compare stored (canvas) against overridden (preview) directly.

## No new wire format, no schema change

`preview.ts` forwards `scopeOverrides` verbatim; the two new maps ride along. Nothing is written to
the stored scene, the exporter, or the on-air path.
