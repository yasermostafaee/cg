# Tasks — add-sequence-element

## 1. Schema (@cg/shared-schema)

- [ ] 1.1 `SequenceItemSchema { id min-1, text, dwellMs?: positive int }` +
      `SequenceElementSchema` (`type: 'sequence'`; the ticker/clock text
      subset; `align` default `'start'`; `direction: 'ltr'|'rtl'`; `items`;
      `defaultDwellMs` default 5000; `advance: 'auto'|'manual'` default
      `'auto'`; `transitionIn` default `'bottom'` / `transitionOut` default
      `'top'` (`top|bottom|left|right|none`); `transitionTiming:
    'simultaneous'|'sequential'` default `'simultaneous'`; `transitionMs`
      default 400; `repeat: int ≥ 1 | 'infinite'` default `'infinite'`) in
      the Element union/exports
- [ ] 1.2 `sequence-items { elementId }` variant in `BindingTargetSchema`
- [ ] 1.3 Fix the `ListItemSchema` comment in `fields.ts` to cite the
      sequence's real fields (`text`/`dwellMs`)
- [ ] 1.4 Schema unit tests: defaults applied + parse round-trip; invalid
      dwell/transition values rejected

## 2. Runtime (@cg/template-runtime)

- [ ] 2.1 Motion mapper (pure module): edge → offscreen offset vector sized
      to the clipped box (`top` −Y, `bottom` +Y, `left` −X, `right` +X;
      `none` = no motion / instant cut); composition per timing
      (`simultaneous` push both motions together; `sequential` exit
      completes before entry begins; each motion `transitionMs`, sequential
      total 2×); eased with the SHARED `cubicBezierEase` +
      `EASING_PRESETS['ease-in-out']` — no new easing; transforms only;
      additive seam for future styles
- [ ] 2.2 `buildSequence` in `scene-builder.ts`: dataset `cgElementId` +
      `applyBaseStyles`; clipped box (overflow hidden) styled like the
      ticker band subset; bidi-isolated item nodes per `direction`,
      vertically centred, aligned per `align`; static initial render =
      item 1 (empty items ⇒ empty box); `ctx.scope.sequences.push(
    { element, host })` beside tickers/clocks
- [ ] 2.3 `sequence-driver.ts`: `SequenceDriver` — options `{ host,
    direction, items, defaultDwellMs, advance, transitionIn,
    transitionOut, transitionTiming, transitionMs, repeat, clock? }`;
      surface `start/pause/resume/stop/reset/destroy/whenComplete` +
      `next()`/`setItems()`; dwell in accumulated ACTIVE time; pause
      freezes dwell AND in-flight transition (no-jump resume); auto = timer + next() (dwell restarts); manual = next() only; past-last-of-pass-N
      (timer OR next()) completes exactly once with the LAST item on
      screen; `reset()` mints a fresh promise; infinite never resolves;
      `setItems()` reconciles by stable id (current item never yanked;
      in-place text edit; removal at next advance; order + per-item dwellMs
      from the new list); `next()` before `start()` ignored;
      `registerSequenceDriver`/`sequenceDriverFor` registry +
      `coerceSequenceItems`
- [ ] 2.4 `runtime.ts`: per-scope SequenceDrivers from `scope.sequences`;
      content wait = `Promise.all` over [finite tickers, countdown clocks,
      FINITE sequences]; hold entry resets+starts sequences alongside
      tickers/clocks; full pause/resume/stop/settle/remove/destroy cascade;
      `tick(frame)` untouched; **`runtime.next()` implemented** — cascade
      scopes parent-first to their sequence drivers' `next()`, resolve
      immediately, safe no-op with no sequences; code-comment the D-031
      steps-model seam
- [ ] 2.5 `bindings.ts`: `applyOne` case `sequence-items` → driver
      `setItems` via the registry (structured value, no
      stringify/transform)
- [ ] 2.6 Unit tests (injected RuntimeClock): mapper per edge incl. `none`
      either/both sides + both timings (sequential: entry never begins
      before the exit completes); driver advance + per-item dwell fallback;
      manual mode; next() restarts dwell in auto; completion exactly once
      past last item of pass N by timer AND by next(); infinite never;
      pause freezes dwell AND in-flight transition; reconcile rules;
      next()-before-start ignored; runtime.next() cascade + no-op;
      content-driven hold with a finite sequence alone and all three kinds
      mixed; stop() during the hold = immediate hard out; loop-cycle fresh
      run per hold entry; tick() untouched; scene-builder static item-1
      render
- [ ] 2.7 Doc-sync: `packages/template-runtime/README.md` (SequenceDriver
      section; three content-source kinds; runtime.next() dispatch + D-031
      seam; motion-mapper extension point); `docs/engines/overview.md`

## 3. Designer UI

- [ ] 3.1 Sequence tool `{ id: 'sequence', label: 'Sequence', icon: '⇉' }`
      (CanvasToolbar + ToolRail + DesignerTool union) + CanvasOverlay
      placement; `defaultSequence` (≈720×72, Vazirmatn 500/36, `#FFFFFF`,
      `rtl`, transparent, 3 Persian now/next items); timeline icon/colour
- [ ] 3.2 `SequenceSections` in `StyleSection.tsx`: pinned "Sequence"
      section — transition PRESET select (Push ×4 / Slide ×4 / Hide-show /
      Custom; preset writes the three fields; non-matching combination
      displays Custom — the EasingEditor pattern), In/Out/Timing selects,
      Transition ms, Advance, Default dwell (seconds ↔ ms), Repeat
      (infinite | N), Direction, items editor (dwell column on) +
      time-driven note + clock-style text parity section
- [ ] 3.3 `ListItemsEditor`: prop-gated `showDwell` per-item dwell input,
      preserved unknown fields; enabled in the inspector AND the preview
      field form for sequence-bound lists (the bind resolver knows the
      target kind)
- [ ] 3.4 Data key: `setElementDataKey` sequence branch (list field seeded
      from authored items + `sequence-items` binding, one-key-one-owner);
      `setSequenceItems` lockstep; `bind-resolver` arm (list × sequence) +
      `describeBinding`; `DynamicDataSection`/`InspectorPanel` gates
- [ ] 3.5 Preview transport: enable the existing **Next** button for scenes
      containing a sequence (replace the hardcoded `stepCount = 1`); it
      already posts `next` → preview `window.next()` → `runtime.next()`
- [ ] 3.6 `PlayoutSection.tsx`: `hasContentElement` also true for
      `'sequence'`; copy "Content-driven — until the content completes
      (ticker passes / countdown / sequence passes)"; preview timing
      hold-source gate counts sequences
- [ ] 3.7 Designer unit tests: preset → three-fields mapping incl. the
      Custom fallback display; `defaultSequence` validity; data-key
      seeding/lockstep

## 4. Export/GDD assertion

- [ ] 4.1 Test: a sequence scene's single-file export carries the element,
      `next()` pages it (driver in the bundled runtime), and the GDD
      matches the D-028 list representation (no generator changes)

## 5. E2E + gate

- [ ] 5.1 `apps/designer/tests/e2e/sequence.spec.ts` (+ `addSequence` etc.
      fixtures): author → canvas shows item 1 → Default dwell ≈0.8s →
      preview play → item 2 arrives on its own → Next → item 3 immediately;
      switch preset to "Slide left", paging still works; finite run
      (repeat 1, two items, short dwell) + auto-out + content-driven exits
      on its own; data key → preview items editor (with dwell column)
      live-updates the stage; run via `pnpm test:e2e`
- [ ] 5.2 Green gate per CLAUDE.md (format:check + typecheck + lint + test + build), test task uncached once (`turbo --force`);
      `pnpm openspec validate add-sequence-element --strict`
