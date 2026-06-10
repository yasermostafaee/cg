# Tasks — add-ticker-element

## 1. Schema (@cg/shared-schema)

- [x] 1.1 `TickerElementSchema` (`type: 'ticker'`; base + `font`, `color`,
      optional `backgroundColor`/`backgroundFill`/`cornerRadius`/`padding`,
      `direction: 'rtl'|'ltr'`, `speed` positive, `gap` ≥ 0, `separator?`,
      `items: [{ id, text }]`) added to the `Element` TS union and the
      `ElementSchema` z.union
- [x] 1.2 `ListFieldSchema` (`type: 'list'`; items = required `id` + open
      fields; `default: ListItem[]`) in `DynamicFieldSchema`; widen
      `FieldValueSchema` with the item array
- [x] 1.3 `ticker-items { elementId }` variant in `BindingTargetSchema`
- [x] 1.4 Schema unit tests: ticker element validation (speed > 0, explicit
      direction, items), list field extensible-item acceptance, list
      FieldValue round-trip, ticker-items binding

## 2. Runtime (@cg/template-runtime)

- [x] 2.1 `buildTicker` in `scene-builder.ts`: clipped band (base styles +
      `overflow: hidden`), inner track, per-item absolutely-positioned
      bidi-isolated spans, separators as standalone spans, Vazirmatn-first
      font stack, registered in the scope element map
- [x] 2.2 `ticker-driver.ts`: virtualized treadmill feed + node recycling;
      width measurement at/after fonts-ready, re-measured per content cycle
      (self-heal for mid-font-swap measurements); rAF playhead on the
      injectable `RuntimeClock`; `translateX` only; start-on-hold /
      stop-on-settle; pause/resume; the inner repeat loop
      (`repeat: 'infinite' | N`, `cycleBoundary: 'seamless' | 'drain'`) with
      a clean finite end — feeding stops after pass N, `whenComplete()`
      resolves when the last item fully exits, `'drain'` empties the band
      between passes (no `passRemainingMs()` / seam-projection math);
      `reconcile(items)` by stable id (positional-id fallback for string
      arrays; in-place text re-measure with offset compensation)
- [x] 2.3 `runtime.ts`: per-scope self-wired content completion
      (`waitForContent` = `Promise.all` over the scope drivers'
      `whenComplete()`; explicit boot `contentHold` wins at root); hold entry
      resets + starts the scope's tickers (fresh crawl per cycle); driver
      lifecycle wired to play/stop/pause/resume/settle cascade
- [x] 2.4 `bindings.ts`: `applyOne` case `ticker-items` → driver reconcile
- [x] 2.5 Unit tests (injected clock + injectable measurement): completion
      timing golden (width/speed/viewport), drain offsets, finite end-empty
      (repeat N completes with the last item fully exited; no pass N+1 fed),
      infinite never completes (until stop), fresh-run-per-reset, reconcile
      (append/remove/edit/jump-free invariants; mid-list reconcile order),
      stale-token (late completion after stop is ignored), loop×content
      per-cycle waits, pause lockstep, explicit-`contentHold` precedence,
      nested-scope ticker
- [x] 2.6 Doc-sync: `packages/template-runtime/README.md` extension points
      (element type example + content-completion self-wiring + ticker-items
      binding kind); `docs/engines/overview.md` if the seam description
      changes

## 3. Designer preview font fix

- [x] 3.1 `platform/preview.ts`: load + await `asset-*` font faces before the
      runtime can play (awaited in `applyScene` pre-`createRuntime` AND in the
      `play` action for late-arriving asset urls; failures degrade gracefully,
      escaping rules respected); first pass measures final glyphs

## 4. Designer UI

- [x] 4.1 Ticker tool: `DesignerTool` union, `ToolRail` + `CanvasToolbar`,
      `CanvasOverlay` insert branch, `defaultTicker` factory (Persian-first
      defaults)
- [x] 4.2 Inspector ticker section: direction, speed, gap, separator, items
      editor (add/remove/reorder/edit via the shared `ListItemsEditor`);
      data-key gate for ticker
- [x] 4.3 Data-key flow: list-field seeding from authored items + lockstep
      `setTickerItems` (`state/slices/fields.ts`), `bind-resolver` arm
      (list × ticker → `ticker-items`), `describeBinding` case
- [x] 4.4 `PreviewFieldForm`: `list` case rendering the items editor;
      required-list validation
- [x] 4.5 Timeline: `LayerTypeIcon` ticker glyph + lifespan colour;
      time-driven (no-scrub) note in the inspector Ticker section
- [x] 4.6 Designer store tests (seeding, one-key-one-owner, kind-mismatch
      rejection, items lockstep, list-aware meta)

## 5. Export / GDD

- [x] 5.1 `gdd.ts`: widen `GddProperty` for arrays; `case 'list'` with object
      items schema (verified against the GDD meta-schema: arrays are
      `type: 'array'` + `items`; **no array `gddType` exists in GDD v1**)
- [x] 5.2 Preflight warnings: `gdd-list-field-limited-clients` (single-file;
      incl. the JSON-only note) and `vcg-ticker-fonts-not-bundled` (.vcg)
- [x] 5.3 Export tests (GDD list property; both preflight issues)

## 6. E2E + gate

- [x] 6.1 E2E fixtures: `addTicker`, `tickerItemInput`/`addTickerItem`
      helpers; ticker.spec.ts (author → items → data key → live preview
      update → crawl; export carries ticker + GDD array)
- [x] 6.2 Green gate: full `pnpm turbo run build typecheck lint test` (67
      tasks) + `turbo test:e2e` (10 passed) +
      `pnpm openspec validate add-ticker-element --strict`

## 7. Ticker-level repeat + hold-source axis (B, approved)

- [x] 7.1 Schema: `TickerElement.repeat` (`'infinite'` default | N) +
      `cycleBoundary` (`'seamless'` default | `'drain'`);
      `Playout.holdSource` (`'timed'` default | `'content-driven'`)
      orthogonal to `mode`; legacy `mode: 'content-driven'` normalized via
      `z.preprocess` at parse time and defensively in `playoutOf()`
      (→ `loop-cycle` + `holdSource: 'content-driven'`)
- [x] 7.2 `playout-controller.ts`: `waitForContent?: () => Promise<void> |
null` seam; hold token guards stale resolutions (after stop / from an
      earlier cycle); `null` (no content in scope) ⇒ a zero-length hold
      deferred like a 0ms timer
- [x] 7.3 Driver completion (`whenComplete()`, clean finite end, drain) +
      `runtime.ts` `Promise.all` wiring + `RuntimeBootOptions.contentHold`
      root override + per-scope `tickerRepeat`/`tickerBoundary` (and
      `holdSource`) in `PlayoutOverride`
- [x] 7.4 Designer UI: `PlayoutSection` hold-source select gated on the
      scope containing a ticker; preview per-scope `holdSource` /
      `tickerRepeat` / `tickerBoundary` overrides with the same gate;
      inspector inner-loop controls (`repeat` passes + cycle-seam select)
- [x] 7.5 `@cg/vcg-format`: playout metadata carries `holdSource` (emitted
      for `content-driven` only) + legacy-normalization tests (stored
      `mode: 'content-driven'` round-trips normalized)
- [x] 7.6 Preflight info `ticker-finite-with-timed-hold` (a finite ticker
      under a timed hold is authored intent — surfaced info-level, not
      blocked)
- [x] 7.7 E2E: finite-repeat + drain ticker completes — the stage settles
      with no `stop()` issued
- [x] 7.8 Docs REPLACE sweep (this task): proposal/design/tasks + delta
      specs + `docs/prd/designer.md` D-028 +
      `packages/template-runtime/README.md` + `docs/engines/overview.md` —
      superseded durationHook / composition-pass-counting wording removed
      everywhere
