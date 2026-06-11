# Add Sequence / Now-Next Element (D-029)

## Why

Rundown-style now/next lower-thirds — one item on screen, advancing on a
timer or on command — are a staple broadcast graphic and not expressible
today. And `TemplateRuntime.next()` is a stub even though the CasparCG
`CG NEXT` global is already wired: this change lands its first real consumer
and the per-scope dispatch seam the future steps model (D-031) plugs into.
The ticker (D-028) and clock (D-027) built the pattern this element
completes: a per-element driver on the self-wire surface, the injectable
`RuntimeClock`, the `list` field + structured binding, and content-driven
hold completion — the sequence becomes the THIRD content-source kind.

## What Changes

- **Schema (`@cg/shared-schema`):** new `SequenceElement`
  (`type: 'sequence'`): the ticker/clock text-styling subset (`font`,
  `color`, `colorFill?`, `textShadow?`, `backgroundColor?`,
  `backgroundFill?`, `cornerRadius?`, `padding?`),
  `align: 'start' | 'center' | 'end'` (default `'start'`),
  `direction: 'ltr' | 'rtl'`, `items: [{ id, text, dwellMs? }]`
  (`SequenceItemSchema`), `defaultDwellMs` (default 5000),
  `advance: 'auto' | 'manual'` (default `'auto'`), the DECOMPOSED
  transition — `transitionIn` / `transitionOut`
  (`'top' | 'bottom' | 'left' | 'right' | 'none'`, defaults
  `'bottom'`/`'top'`), `transitionTiming: 'simultaneous' | 'sequential'`
  (default `'simultaneous'`), `transitionMs` (default 400) — and
  `repeat: 'infinite' | N` (default `'infinite'`). Added to the element
  unions; additive, no migrations. The stale `ListItemSchema` comment in
  `fields.ts` is corrected to cite the sequence's real fields
  (`text`/`dwellMs`). New binding target `sequence-items { elementId }`
  mirroring `ticker-items`.
- **Runtime (`@cg/template-runtime`):**
  - A pure MOTION MAPPER module: edge → offscreen offset vector sized to
    the clipped box (`top` = −Y, `bottom` = +Y, `left` = −X, `right` = +X;
    `none` = no motion, instant cut for that side), composed per
    `transitionTiming` (`simultaneous` = push, both motions together;
    `sequential` = the exit completes before the entry begins; each motion
    lasts `transitionMs`). Eased with the SHARED easing
    (`cubicBezierEase` + the `ease-in-out` preset from `@cg/shared-schema`)
    — no new easing. Transforms only, inside `overflow: hidden`. Future
    styles (e.g. fade) are new enum members + a mapper case — additive.
  - `buildSequence` in `scene-builder.ts`: clipped box styled like the
    ticker band subset; bidi-isolated item nodes per `direction`,
    vertically centred, aligned per `align`; static initial render =
    item 1; collected on `scope.sequences` beside tickers/clocks.
  - `sequence-driver.ts`: `SequenceDriver` on the established surface
    (`start`/`pause`/`resume`/`stop`/`reset`/`destroy`/`whenComplete` +
    `next()`/`setItems()`, injectable `RuntimeClock`). Dwell measured in
    accumulated ACTIVE time; pause freezes the dwell AND an in-flight
    transition; `auto` advances by timer and by `next()` (which restarts
    the new item's dwell); `manual` advances only by `next()`; advancing
    past the last item of pass N — timer or `next()` — completes the run
    exactly once with the LAST item staying on screen; `reset()` mints a
    fresh promise; `'infinite'` never resolves; `setItems()` reconciles by
    stable id (the current item is never yanked mid-display; text edits
    correct in place; removals take effect at the next advance); `next()`
    before `start()` is ignored.
  - `runtime.ts`: content wait = `Promise.all` over [finite tickers,
    countdown clocks, FINITE sequences]; hold entry resets + starts the
    scope's sequences alongside tickers/clocks; full lifecycle cascade;
    `tick(frame)` untouched. **`runtime.next()` implemented for real**:
    cascades scopes parent-first to their sequence drivers' `next()`,
    resolves immediately, safe no-op with no sequences — documented as the
    dispatch seam D-031's steps model will join (CasparCG's `CG NEXT`
    global already calls it).
  - `bindings.ts`: `applyOne` case `sequence-items` → driver `setItems`
    via a `registerSequenceDriver` map (the ticker registry pattern).
- **Designer:** Sequence tool (`⇉`) + placement; `defaultSequence`
  (≈720×72, Vazirmatn 500/36, `rtl`, transparent, 3 Persian now/next
  items); `SequenceSections` in the inspector — a transition PRESET select
  (Push ×4 / Slide ×4 / Hide-show / Custom, the EasingEditor Preset
  pattern: a preset writes the three fields, a non-matching combination
  displays Custom), In/Out/Timing selects, Transition ms, Advance, Default
  dwell (seconds ↔ stored ms), Repeat, Direction, the items editor, the
  time-driven note, and the clock-style text parity section. The shared
  `ListItemsEditor` gains a prop-gated per-item dwell column (inspector AND
  preview field form). Data key seeds a `list` field from the authored
  items and binds `sequence-items` (the ticker flow). The preview
  transport gains a **Next** button on the play/stop/pause path.
  `PlayoutSection.hasContentElement` also admits sequences; the
  content-driven copy becomes "ticker passes / countdown / sequence
  passes".
- **Export / GDD:** no generator changes — the `list` field is already
  representable (D-028) and lists stay JSON-only (existing preflight
  warning). Asserted by test: a sequence scene's single-file export boots
  clean, `next()` pages it, and the GDD matches the D-028 list
  representation.

## Capabilities

### New Capabilities

- `designer-sequence-element`: the sequence element end-to-end — schema,
  the decomposed in/out/timing transition model with named presets, the
  dwell/advance/pass driver semantics, `next()` dispatch, live `list`
  reconcile, designer authoring UI (incl. the per-item dwell column and
  the preview Next control), RTL/bidi behaviour, and export/GDD parity.

### Modified Capabilities

- `designer-playout-lifecycle`: content sources gain FINITE SEQUENCES as
  the third member (finite tickers + countdown clocks + finite sequences,
  same `Promise.all`, same hold token, same per-hold-entry reset+start);
  an infinite sequence never completes. Every existing scenario is
  preserved; a finite-sequence scenario and a three-kinds-mixed scenario
  are added.

## Impact

- **Schema:** `packages/shared-schema/src/elements.ts` (sequence variant +
  unions), `bindings.ts` (`sequence-items`), `fields.ts` (comment fix).
- **Runtime:** `packages/template-runtime/src/` — new
  `sequence-motion.ts` (mapper), new `sequence-driver.ts`,
  `scene-builder.ts` (`buildSequence` + `scope.sequences`), `runtime.ts`
  (three-kind content wait, `next()` dispatch, cascades), `bindings.ts`
  (`sequence-items` case), `types.ts` (scope entry + `TemplateRuntime`),
  `index.ts` exports, `README.md` (doc-sync).
- **Designer:** canvas toolbar/overlay, `state/element-defaults.ts`,
  `state/slices/fields.ts` (data-key seeding + items lockstep),
  `features/fields/bind-resolver.ts`, `features/fields/ListItemsEditor.tsx`
  (dwell column), `features/fields/PreviewFieldForm.tsx`,
  `features/fields/PreviewTransport.tsx` (Next),
  `features/inspector/StyleSection.tsx` (`SequenceSections`),
  `features/inspector/DynamicDataSection.tsx` + `InspectorPanel.tsx`
  (data-key gate), `features/inspector/PlayoutSection.tsx`,
  `features/timeline/ElementRow.tsx` (icon/colour).
- **Tests:** motion-mapper table-driven; driver units (injected clock);
  runtime lifecycle (finite sequence alone, three kinds mixed, hard stop,
  loop-cycle fresh runs, `next()` cascade/no-op); scene-builder static
  render; schema round-trip; designer preset-mapping units; E2E
  `sequence.spec.ts` via the shared fixtures.
- **Dependencies:** D-028 (list field, structured binding, holdSource),
  D-027 (driver/content-source precedent). Rescopes D-031 (its Notes are
  updated in this change: `next()` plumbing now exists; D-031 keeps the
  authored steps model on the same dispatch). Unblocks the now/next
  starter scenarios.

## Out of scope (v1)

Rich per-item layout (D-030), per-item transition overrides,
fade/crossfade edge values, the steps model (D-031), `next()` queueing
during the intro. Recorded in `design.md`.
