# Add Ticker / Crawler Element (D-028)

## Why

News crawls are a core broadcast deliverable and the most-requested template
type. Today both ticker starters fake the crawl with hard-coded linear
`position.x` keyframes over a fixed distance (`starter-templates/src/ticker.ts`,
`news.ts`): long text gets clipped, short text leaves dead air, nothing loops,
and the items live in one delimiter-joined string field. D-020 left a
content-timing seam explicitly "for the ticker item" — **no production code
supplies it yet**. This change ships the first real content element: a
`ticker` whose crawl duration is computed from measured content width ÷
speed. It also supersedes D-020's `content-driven` _mode_ + `durationHook`
seam with a **two-loop completion model**: the ticker owns its own crawl
passes and signals completion; the composition's hold can await that
completion (`holdSource`).

## What Changes

- **Schema (`@cg/shared-schema`):**
  - New `TickerElement` (`type: 'ticker'`): clipped horizontal band using the
    base transform for geometry; text styling (`font`, `color`, optional
    background); `direction: 'rtl' | 'ltr'` (**reading direction** — explicit,
    no `'auto'`; `'rtl'` = RTL item layout, track moves visually left→right,
    matching the Persian news-starter convention); `speed` (px/s, positive);
    `gap` (px between items); `separator?` (rendered between items);
    `items: [{ id, text }]` as authored defaults; and the **inner repeat
    loop** — `repeat: 'infinite' | N` (default `'infinite'`) crawl passes with
    `cycleBoundary: 'seamless' | 'drain'` (default `'seamless'`) deciding the
    seam between passes. Added to both element unions. Additive — no
    `schemaVersion` bump.
  - **`Playout` gains the `holdSource` axis** (`'timed' | 'content-driven'`,
    absent = `'timed'`): WHAT ENDS A HOLD, orthogonal to `mode` and usable
    under both `auto-out` and `loop-cycle` (`mode` keeps counting open/close
    cycles). `'content-driven'` is **no longer a mode**; a stored legacy
    `mode: 'content-driven'` normalizes at parse time (`z.preprocess`) — and
    defensively in `playoutOf()` for unparsed scenes — to
    `mode: 'loop-cycle', holdSource: 'content-driven'` (behaviourally
    faithful: no pre-D-028 scene had tickers, so holds were zero-length in
    both forms).
  - New `list` dynamic-field type. The item shape is **extensible by design**:
    an object with a **required `id`** plus open fields (the ticker consumes
    `text`; the upcoming repeater (D-030) and sequence (D-029) will reuse the
    same field type with richer items). `FieldValue` widens with the item
    array. List values travel as JSON only — the legacy CasparCG XML payload
    path cannot carry them (documented; preflight notes the limitation).
  - New binding target kind `ticker-items { elementId }` so a `list` field
    drives a ticker's items.
- **Runtime (`@cg/template-runtime`):**
  - `buildTicker` renders the band (clipped box) with an inner translated
    track; items are individually positioned from measured widths with
    per-item bidi isolation, so mixed RTL/LTR items cannot reorder across item
    boundaries (the ADR-0003 pitfall).
  - A **ticker driver** (treadmill): measures item widths at/after
    `document.fonts.ready` (re-measured once per content cycle — the
    self-heal), scrolls via `transform: translateX` on an rAF playhead with
    the injectable `RuntimeClock`, and recycles exited nodes. It owns the
    **inner repeat loop**: a finite `repeat: N` run ends **cleanly** —
    feeding stops after the Nth pass's last item and `whenComplete()` resolves
    once that item has fully exited the band (never cut mid-scroll;
    `cycleBoundary: 'drain'` also empties the band BETWEEN passes). The
    treadmill rolls continuously WITHIN one hold; each composition open/close
    cycle restarts the crawl from its entering edge. `pause()`/`resume()`
    freeze/continue it in lockstep with the playout controller's hold timing.
  - **The runtime self-wires per-scope content completion**: a scope whose
    composition contains ticker elements gets a `waitForContent` supplier —
    `Promise.all` over its drivers' `whenComplete()` (all finite tickers done;
    an infinite ticker never resolves, so the scope holds until `stop()`; no
    tickers ⇒ a zero-length hold, deferred like a 0ms timer). Each hold entry
    resets + starts the scope's tickers (`onHoldStart`), so every open/close
    cycle gets a fresh crawl. Works for the root scene **and nested
    composition scopes**. An explicitly passed
    `RuntimeBootOptions.contentHold` still wins for the root scope (external
    override/test seam).
  - `PlayoutOverride` (and the preview's per-scope timing override) gains
    `holdSource`, `tickerRepeat`, `tickerBoundary` — session-only, per scope,
    gated in the UI to scopes that actually contain tickers.
  - `update()` with a new items list **reconciles by stable id**: existing
    items keep their node and position, new items enter on the next feed,
    removed items leave once off-screen — no restart, no visual jump. Bare
    string arrays are accepted with positional-id fallback (degraded:
    jump-free only for appends).
  - New `applyOne` case for `ticker-items` bindings.
- **Designer:**
  - Ticker tool (tool rail + canvas insertion + default factory) and an
    inspector section: direction, speed, gap, separator, and an items editor
    (add / remove / reorder / edit text).
  - Data-key flow: a ticker's data key seeds a `list` field from the
    element's authored items; `bind-resolver` maps list field × ticker
    element → `ticker-items`.
  - The preview field form renders a `list` field as the same items editor,
    live-updating the crawl via `update()`.
  - The ticker is **time-driven, not timeline-scrubbed**: scrubbing does not
    move it, and the UI says so where the ticker's timing is surfaced.
  - **Preview font fix (shipped with this change, not deferred):** the preview
    awaits operator-imported (`asset-*`) font faces **before** the runtime can
    play, so the first pass a user ever sees measures with final glyphs.
- **Export / GDD:**
  - The single-file export carries the ticker unchanged (same runtime source;
    no boot-option changes needed thanks to self-wiring).
  - GDD represents a `list` field as a typed array property (exact `gddType`
    per the GDD meta-schema, verified during implementation); preflight warns
    that third-party GDD clients may not render an array editor (precedent:
    `gdd-image-field-not-portable`), and that `.vcg` exports ship no font
    bytes (a ticker measured against fallback fonts computes a wrong duration
    silently).

## Capabilities

### New Capabilities

- `designer-ticker-element`: the ticker element end-to-end — schema, crawl
  behaviour (content-driven duration, seamless wrap, reconcile-by-id, RTL
  reading-direction model, fonts-ready measurement), designer authoring UI,
  the `list` field type + `ticker-items` binding, preview/export parity, and
  GDD representation.

### Modified Capabilities

- `designer-playout-lifecycle`: hold duration becomes its own axis —
  `holdSource: 'timed' | 'content-driven'`, orthogonal to `mode` (which keeps
  counting open/close cycles; `'content-driven'` is no longer a mode — legacy
  stored values normalize to `loop-cycle` + `holdSource: 'content-driven'`).
  A `content-driven` hold lasts until every ticker in the scope completes
  (`Promise.all`; an infinite ticker holds until `stop()`; no tickers ⇒ a
  zero-length hold). The runtime self-wires this from ticker elements (root
  and nested scopes) via the controller's `waitForContent` seam, with a hold
  token guarding stale resolutions; an explicit
  `RuntimeBootOptions.contentHold` overrides the root scope.

## Impact

- **Schema:** `packages/shared-schema/src/elements.ts` (ticker variant + both
  unions, incl. `repeat`/`cycleBoundary`), `scene.ts` (`holdSource` axis +
  legacy `PlayoutSchema` normalization + `playoutOf` guard), `fields.ts` (list
  field + widened `FieldValue`), `bindings.ts` (`ticker-items` target).
- **Runtime:** `packages/template-runtime/src/scene-builder.ts` (`buildTicker`),
  new `ticker-driver.ts` (incl. `whenComplete()`), `runtime.ts` (per-scope
  self-wired content completion; driver lifecycle on
  play/stop/pause/resume/settle), `playout-controller.ts` (`holdSource` +
  `waitForContent` + hold token), `types.ts` (`contentHold`;
  `PlayoutOverride` `holdSource`/`tickerRepeat`/`tickerBoundary`),
  `bindings.ts` (`ticker-items`), `README.md` (extension-point doc-sync).
- **Designer:** `state/store-core.ts` + `features/tools/ToolRail.tsx` (tool),
  `state/element-defaults.ts`, `features/canvas/CanvasOverlay.tsx` (insert),
  `features/inspector/StyleSection.tsx` (+ ticker section incl. items editor),
  `features/inspector/InspectorPanel.tsx` (data-key gate),
  `state/slices/fields.ts` (list data-key variant),
  `features/fields/bind-resolver.ts`, `features/fields/PreviewFieldForm.tsx`
  (list editor case), `features/timeline/ElementRow.tsx` (icon),
  `platform/preview.ts` (await font faces before play).
- **Export:** `packages/vcg-format/src/gdd.ts` (array property + list case),
  `apps/designer/src/platform/ExporterSingleFile.ts` (preflight warnings).
- **Tests:** schema validation (incl. legacy-mode normalization); runtime unit
  (completion timing golden, drain offsets, finite end-empty, reconcile logic,
  playout integration with injected clock + fake measurement); Designer store
  tests; E2E (author → preview → update flow via the shared fixtures).
- **Dependencies:** D-018 (dynamic fields), D-020 (playout lifecycle — change
  `add-animation-lifecycle-timing`; its `content-driven` mode + `durationHook`
  seam are superseded here by the `holdSource` axis + the completion seam).
  Unblocks D-030 (repeater) and D-029 (sequence) by establishing the
  extensible `list` field.
