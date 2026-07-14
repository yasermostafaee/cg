# Per-element timing overrides in preview — Phase 2: sequences + countdowns (D-102)

## Why

D-102 Phase 1 moved TICKER preview timing from per-scope to PER-ELEMENT (keyed by `elementId`), but
left two gaps:

- **Sequences and countdown clocks are still untunable in preview.** They are content sources
  exactly like a ticker — a sequence's `repeat` / dwell and a countdown's target decide how long the
  scope holds — yet the timing panel offers no session control for them. Rehearsing a 10-minute
  countdown or a 5s-per-item sequence means waiting it out in real time.
- **A ticker inside a repeater's child composition is INVISIBLE to the panel.** The timing tree walks
  only authored composition instances (`compositionInstancesOf` → `scope.children`) and never
  descends into a repeater's child composition, whose content the runtime stamps onto
  `scope.repeaters` row subtrees. Its tickers exist and run, but cannot be seen or tuned.

## What Changes (Phase 2 — sequences + countdowns + the repeater gap)

- **Override model:** `PlayoutOverride` (runtime) / `TimingOverride` (designer) gain two more
  element-id-keyed maps beside Phase 1's `tickers`: `sequences?: Record<elementId, { repeat?,
dwellMs? }>` and `countdowns?: Record<elementId, { durationMs? }>`. Same shape, same keying, same
  session-only lifetime. The per-scope LIFECYCLE override (`mode` / `holdSource` / `holdMs` /
  `repeat`) is unchanged.
- **UI:** `PreviewScopeTiming` enumerates every SEQUENCE and every COUNTDOWN clock of a scope
  alongside its tickers (recursing containers; duplicate names disambiguated) and renders one row
  each — a sequence row (passes + per-item dwell), a countdown row (preview duration). `wall` /
  `countup` clocks are NOT listed: they never complete, so there is no timing to tune.
- **Repeater gap:** the enumeration walk descends a `repeater` element into its child composition
  (cycle-/depth-guarded) and lists that composition's content elements. The control governs the
  AUTHORED (template) element; the runtime applies it to every stamped row, because
  `wireScopeSubtree` now inherits the host scope's per-element timing maps into stamped row
  subtrees. There is deliberately no per-data-row control — every stamped row is built from the SAME
  authored element (same `elementId`), so per-row is not expressible under element-id keying, and the
  row count is data-driven.
- **Runtime:** each sequence's override is applied to THAT sequence's own `SequenceDriver` (a new
  `dwellOverrideMs` option wins over the item's own `dwellMs` and the element's `defaultDwellMs`, so
  the control bites on every item and survives a bound-list `update()`); each countdown's
  `durationMs` override replaces that clock's `target` with a `{ kind: 'duration' }` target for the
  run — the only way to rehearse a `datetime`-target countdown. Effective (post-override) timing is
  stamped on each host (`data-cg-sequence-repeat` / `-dwell`, `data-cg-countdown-ms`) exactly as
  Phase 1 stamps the ticker band.
- **Session-only:** the stored template is never changed — no schema change, no migration, no
  exporter / runtime / on-air change.

## Impact

- Affected specs: **designer-playout-lifecycle** (MODIFIED — the Phase-1 per-element ticker
  requirement now also covers repeater-stamped tickers; ADDED — per-element sequence + countdown
  timing overrides).
- Affected code: `@cg/template-runtime` (`types.ts` `PlayoutOverride`, `runtime.ts`
  `wireScopeSubtree` / `wireScope`, `sequence-driver.ts` `dwellOverrideMs`), `@cg/designer`
  (`PreviewScopeTiming`, `PreviewTimingControls`). `preview.ts` forwards `scopeOverrides` unchanged
  (the new maps ride along).
- **No schema change** (preview override is session-only, never stored); no exporter / on-air path
  touched, so CI-green is sufficient — no CasparCG hardware validation is required.
