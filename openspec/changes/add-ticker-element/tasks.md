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
      width measurement once per (id, text) at/after fonts-ready; rAF
      playhead on the injectable `RuntimeClock`; `translateX` only;
      start-on-hold / stop-on-settle; pause/resume; cycle-seam bookkeeping;
      `passRemainingMs()` for the duration hook; `reconcile(items)` by stable
      id (positional-id fallback for string arrays; in-place text re-measure
      with offset compensation)
- [x] 2.3 `runtime.ts`: per-scope self-wired durationHook (explicit boot
      option wins at root; max across tickers per scope); driver lifecycle
      wired to play/stop/pause/resume/settle cascade
- [x] 2.4 `bindings.ts`: `applyOne` case `ticker-items` → driver reconcile
- [x] 2.5 Unit tests (injected clock + injectable measurement): duration math
      golden (width/speed/viewport, first vs. later passes), reconcile
      (append/remove/edit/jump-free invariants), playout integration
      (repeat N → N content cycles → exit; infinite until stop; pause
      lockstep; explicit-hook precedence; nested-scope ticker)
- [x] 2.6 Doc-sync: `packages/template-runtime/README.md` extension points
      (element type example + first durationHook supplier + ticker-items
      binding kind); `docs/engines/overview.md` if the seam description
      changes

## 3. Designer preview font fix

- [x] 3.1 `platform/preview.ts`: load + await `asset-*` font faces before the
      runtime can play (awaited in `applyScene` pre-`createRuntime` AND in the
      `play` action for late-arriving asset urls; failures degrade gracefully,
      escaping rules respected); first pass measures final glyphs

## 4. Designer UI

- [ ] 4.1 Ticker tool: `DesignerTool` union, `ToolRail`, `CanvasOverlay`
      insert branch, `defaultTicker` factory
- [ ] 4.2 Inspector ticker section: direction, speed, gap, separator, items
      editor (add/remove/reorder/edit); data-key gate for ticker
- [ ] 4.3 Data-key flow: list-field seeding from authored items
      (`state/slices/fields.ts`), `bind-resolver` arm (list × ticker →
      `ticker-items`), `describeBinding` case
- [ ] 4.4 `PreviewFieldForm`: `list` case rendering the items editor;
      validation as needed
- [ ] 4.5 Timeline: `LayerTypeIcon` ticker glyph; time-driven (no-scrub) note
      where ticker timing surfaces
- [ ] 4.6 Designer store/unit tests for the new actions + seeding

## 5. Export / GDD

- [x] 5.1 `gdd.ts`: widen `GddProperty` for arrays; `case 'list'` with object
      items schema (verified against the GDD meta-schema: arrays are
      `type: 'array'` + `items`; **no array `gddType` exists in GDD v1**)
- [ ] 5.2 Preflight warnings: list-field third-party editor limitation; `.vcg`
      no-font-bytes ticker-measurement warning; JSON-only note for lists
- [ ] 5.3 Export tests (GDD list property; preflight issues)

## 6. E2E + gate

- [ ] 6.1 E2E fixtures: `addTicker`, items-editor helpers; E2E test mapping
      the author → preview → update scenario
- [ ] 6.2 Green gate: `pnpm turbo run build typecheck lint test` for
      shared-schema, template-runtime, vcg-format, designer; `pnpm test:e2e`;
      `pnpm openspec validate add-ticker-element --strict`
