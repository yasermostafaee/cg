# Add Ticker / Crawler Element (D-028)

## Why

News crawls are a core broadcast deliverable and the most-requested template
type. Today both ticker starters fake the crawl with hard-coded linear
`position.x` keyframes over a fixed distance (`starter-templates/src/ticker.ts`,
`news.ts`): long text gets clipped, short text leaves dead air, nothing loops,
and the items live in one delimiter-joined string field. D-020 built the
`content-driven` playout mode and left a `durationHook` seam explicitly "for the
ticker item" — **no production code supplies it yet**. This change ships the
first real consumer: a `ticker` element whose pass duration is computed from
measured content width ÷ speed.

## What Changes

- **Schema (`@cg/shared-schema`):**
  - New `TickerElement` (`type: 'ticker'`): clipped horizontal band using the
    base transform for geometry; text styling (`font`, `color`, optional
    background); `direction: 'rtl' | 'ltr'` (**reading direction** — explicit,
    no `'auto'`; `'rtl'` = RTL item layout, track moves visually left→right,
    matching the Persian news-starter convention); `speed` (px/s, positive);
    `gap` (px between items); `separator?` (rendered between items); and
    `items: [{ id, text }]` as authored defaults. Added to both element unions.
    Additive — no `schemaVersion` bump.
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
  - A **ticker driver** (treadmill): measures item widths once per content
    (after `document.fonts.ready`), scrolls via `transform: translateX` on an
    rAF playhead with the injectable `RuntimeClock`, recycles exited nodes,
    and rolls **continuously across pass boundaries** (pass replays of the
    composition's intro/outro never restart the crawl). `pause()`/`resume()`
    freeze/continue it in lockstep with the playout controller's hold timer.
  - **The runtime self-wires the per-scope `durationHook`**: a scope whose
    composition contains ticker elements gets an internal hook that returns
    the ms until the current content cycle completes (so `repeat: N` exits
    after exactly N full content passes, immune to intro/outro replay time).
    Works for the root scene **and nested composition scopes** (supersedes the
    root-only external wiring). An explicitly passed
    `RuntimeBootOptions.durationHook` still wins (external override/test
    seam). With several tickers in one scope the longest-running ticker
    governs the pass.
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

- `designer-playout-lifecycle`: the `content-driven` mode gains its first real
  duration supplier — the runtime self-wires a per-scope `durationHook` from
  ticker elements (root and nested scopes); an explicit
  `RuntimeBootOptions.durationHook` overrides it. Pass boundaries align with
  content-cycle completions.

## Impact

- **Schema:** `packages/shared-schema/src/elements.ts` (ticker variant + both
  unions), `fields.ts` (list field + widened `FieldValue`), `bindings.ts`
  (`ticker-items` target).
- **Runtime:** `packages/template-runtime/src/scene-builder.ts` (`buildTicker`),
  new `ticker-driver.ts`, `runtime.ts` (per-scope self-wired hook; driver
  lifecycle on play/stop/pause/resume/settle), `bindings.ts` (`ticker-items`),
  `README.md` (extension-point doc-sync).
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
- **Tests:** schema validation; runtime unit (duration math golden, reconcile
  logic, playout integration with injected clock + fake measurement); Designer
  store tests; E2E (author → preview → update flow via the shared fixtures).
- **Dependencies:** D-018 (dynamic fields), D-020 (`content-driven` +
  `durationHook` — change `add-animation-lifecycle-timing`). Unblocks D-030
  (repeater) and D-029 (sequence) by establishing the extensible `list` field.
