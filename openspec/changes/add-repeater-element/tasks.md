# Tasks — add-repeater-element

## 1. Wiring refactor (FIRST — behavior-preserving)

- [x] 1.1 Extract `createRuntime`'s per-scope wiring (driver instantiation +
      `buildScopeController`) into `wireScopeSubtree(scope, path,
    isRootSubtree) → WiredSubtree { node, tickers, clocks, sequences,
    destroy }` with symmetric teardown (controllers first, then drivers);
      a `subtrees` set replaces the global driver arrays; every cascade
      (play resets, pause/resume, settle freeze, next() dispatch, remove)
      iterates it kind-major in wiring order
- [x] 1.2 Existing template-runtime suite green and UNTOUCHED (the
      behavior-preserving proof); landed as its own commit

## 2. Schema (@cg/shared-schema)

- [ ] 2.1 `RepeaterElementSchema` (`type: 'repeater'`; required
      `compositionId`; `direction: 'column'|'row'` default `'column'`;
      `flow: 'rtl'|'ltr'` default `'rtl'`; `gap` ≥ 0 default 8;
      `maxItems?: positive int`; `items: ListItem[]` default `[]`) in the
      Element union/exports
- [ ] 2.2 `repeater-items { elementId }` variant in `BindingTargetSchema`
- [ ] 2.3 Schema unit tests: defaults + round-trip; invalid gap/maxItems
      rejected

## 3. Runtime (@cg/template-runtime)

- [ ] 3.1 `buildRepeater` in `scene-builder.ts`: clipped outer box;
      `ctx.scope.repeaters.push({ element, host })` (+ `repeaters: []` at
      scope creation); exported row builder mirroring `buildComposition`'s
      inner stage (flow-positioned cell; column ⇒ width-fit / row ⇒
      height-fit, aspect preserved, zero-resolution guard; fresh `newScope`
      from the child's layers with depth+1/visited+childId); rows NOT
      pushed into `scope.children`; build-time stamps the AUTHORED items
- [ ] 3.2 `repeater-driver.ts`: `RepeaterDriver`
      (start/pause/resume/stop/reset/destroy/setItems; NOT a content
      source). reset() = teardown + stamp from CURRENT effective items
      (bound list's effective value incl. retained pre-play update(), else
      authored), clamped by `maxItems`; wire each row through
      `wireScopeSubtree` and attach under the hosting scope's node.
      setItems() mid-run = positional live VALUES (reorder live);
      shorter-hides (display only, scopes persist) / regrow-reshows /
      longer-defers. Row value routing via the per-scope apply path (item
      keys minus `id` → the row scope's child fields).
      `registerRepeaterDriver`/`repeaterDriverFor` registry
- [ ] 3.3 `runtime.ts`: instantiate RepeaterDrivers per scope inside
      `wireScopeSubtree` (host scope's subtree owns them); play() resets
      repeaters FIRST (re-stamp) before driver resets + cascade;
      pause/resume/stop/settle/remove include repeaters; rows attach to
      the cascade; `tick(frame)` untouched
- [ ] 3.4 `bindings.ts`: `applyOne` case `repeater-items` → driver
      `setItems` (structured value, no stringify/transform)
- [ ] 3.5 Unit tests: build-time authored stamp; fresh-play stamp from
      effective items incl. update-before-play count; maxItems clamp; cell
      sizing both directions + flow rtl/ltr + gap + zero-resolution guard;
      positional live values + reorder; shrink-hides / regrow-reshows /
      grow-defers; rows run the child lifecycle lockstep (own out-point
      hold; outro on stop; pause/resume cascade); a row's countdown drives
      that ROW's content-driven hold; cycle/depth guard renders empty;
      scrub parity; teardown leak-check (destroy unwires drivers and
      controllers; no orphan rAF/timers)
- [ ] 3.6 Doc-sync: `packages/template-runtime/README.md` (RepeaterDriver +
      `wireScopeSubtree` as the extension seam; wiring-tree vs
      namespace-tree distinction); `docs/engines/overview.md` if needed

## 4. GDD (@cg/vcg-format)

- [ ] 4.1 `gdd.ts`: a `list` field bound `repeater-items` derives its item
      schema from the referenced child composition's fields (gddType,
      min/max/pattern/default, required; `id` stays declared); other lists
      unchanged; same derivation surfaces in the designer preflight
- [ ] 4.2 vcg-format unit tests: derived schema (types/constraints/
      required); non-repeater lists unchanged

## 5. Designer UI

- [ ] 5.1 Repeater tool `{ id: 'repeater', label: 'Repeater', icon: '▤' }`
      (CanvasToolbar + ToolRail + DesignerTool union) + CanvasOverlay
      guard: insert only with ≥1 valid (non-cyclic, not-self) composition
      (preselect the first valid), else `showNotice` hint;
      `defaultRepeater` (≈480×360, column, gap 8, flow rtl, 3 seeded rows
      keyed by the child's field ids with defaults; field-less child ⇒ 3
      bare `{id}` rows); timeline icon/colour
- [ ] 5.2 `RepeaterSections` in `StyleSection.tsx`: Composition select
      (valid options via the existing cycle guard), Direction, Flow (shown
      for `'row'`), Gap, Max items, items editor (columns from the child's
      fields) + the static-rows note
- [ ] 5.3 `ListItemsEditor`: `columns: {key,label,kind?}[]` prop (the
      dwell-column precedent) — one input per column preserving unknown
      fields; number columns where the child field is numeric; used by the
      inspector AND the preview field form (PreviewModal derives a
      per-field columns map from `repeater-items` bindings)
- [ ] 5.4 Data key: `setElementDataKey` repeater branch (list seeded from
      authored items + `repeater-items`, one-key-one-owner);
      `setRepeaterItems` lockstep; `bind-resolver` arm + `describeBinding`;
      `DynamicDataSection`/`InspectorPanel` gates; `PlayoutSection`
      UNCHANGED
- [ ] 5.5 Designer unit tests: defaultRepeater; columns derivation from
      child fields; insertion guard (no valid composition ⇒ no insert)

## 6. E2E + gate

- [ ] 6.1 `apps/designer/tests/e2e/repeater.spec.ts` (+ fixtures): child
      composition with two text data keys → Repeater tool → 3 rows on
      canvas → inspector cell edit updates the canvas → Data key → preview
      form shows the columned editor and a value edit live-updates a row →
      preview play with a child out-point → rows hold and exit on stop →
      row-count change in the preview takes effect after re-play (deferred
      semantics) → export boots with the derived GDD; run via
      `pnpm test:e2e`
- [ ] 6.2 Green gate per CLAUDE.md (format:check + typecheck + lint + test + build), test task uncached once (`turbo --force`);
      `pnpm openspec validate add-repeater-element --strict`
