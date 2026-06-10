# Design — add-ticker-element

## D1. The runtime self-wires the per-scope durationHook

**Decision:** `createRuntime` detects ticker elements per field scope and
installs an internal duration supplier for that scope's `PlayoutController`.
An explicitly passed `RuntimeBootOptions.durationHook` takes precedence (it
remains the external override/test seam). Precedence: explicit boot option →
internal ticker hook → absent (= 0 ms passes, the existing D-020 behaviour).

**Why:** nothing in production supplies the hook today, and the exported
single-file HTML boots with `CG.createRuntime(scene)` — no options at all
(`ExporterSingleFile.ts`, emitted boot script). Threading the hook externally
would require editing two emitted-HTML template strings (single-file + `.vcg`
index) *and* the preview, and would still be root-scope-only
(`runtime.ts`: `durationHook: isRoot ? options.durationHook : undefined`).
Self-wiring makes preview, single-file export, and `.vcg` correct with zero
boot-code changes and lets a ticker inside a nested composition drive that
child scope's passes.

**Multiple tickers in one scope:** the scope hook returns the **max** across
its tickers — the longest-running ticker governs the pass, so no ticker's
content is cut off mid-cycle.

## D2. Pass = content cycle; the hook returns "ms until the current cycle completes"

The PlayoutController's cycle model replays the composition's intro/outro
keyframes every pass (D-020 semantics, shared with `loop-cycle`). The crawl
must NOT restart with them. So:

- The treadmill starts when the scope first enters its hold phase and then
  rolls **continuously** — through outro/intro replays of later passes and
  through the final outro — until the controller settles (then it stops and
  resets; a later `play()` starts fresh).
- The internal hook does not return a fixed formula; it returns the **remaining
  ms until the current content cycle's tail exits the viewport**, computed from
  driver bookkeeping (fed-width cycle seams vs. current position). First call ≈
  `(viewportWidth + trackWidth) / speed × 1000`; later calls self-correct for
  whatever time intro/outro replays consumed. Result: `repeat: N` exits after
  exactly N full content passes, with pass boundaries aligned to content-cycle
  completions, immune to intro/outro drift.
- Tickers also crawl in non-`content-driven` modes (e.g. `manual`: band holds,
  crawl rolls until `stop()`): the driver is started by the scope's hold entry
  and stopped by settle, independent of mode; only the *hook* is
  `content-driven`-specific.
- **Root self-settle cascades:** when the ROOT scope settles on its own, the
  runtime cascades `stop()` to every nested scope (settled children no-op per
  D-026) and freezes every crawl — otherwise an infinite nested lifecycle
  keeps timers/rAF rolling under the hidden stage with `stop()` unreachable.
- **Static authoring layout:** `buildTicker` renders a measurement-free flex
  row so the Designer canvas shows the items (re-rendered when a list-field
  default replaces them pre-play); a real `play()` removes it (driver reset),
  so every on-air intro shows the same empty band the crawl then enters — the
  first play never flashes stale authored items. It avoids `inset` and flex
  `column-gap` (above the exported single-file's CEF floor — CasparCG 2.2/2.3
  = CEF 63/71): explicit offsets + per-span directional margins.
- **Padding:** CSS padding would be inert for the absolutely-positioned track
  (abspos children resolve against the padding box), so the band nests a
  padding-inset `viewport` div that is the actual clip + travel box; the
  driver's `viewportWidth` subtracts the horizontal padding.

## D3. Treadmill = virtualized feed + node recycling, measured once per content

The driver keeps a logical item list and feeds DOM nodes on demand: when the
last fed node's trailing edge approaches the viewport (+ buffer), it feeds the
next logical item, recycling nodes that have fully exited. Item widths are
measured once per (id, text) — cached — with measurement valid because the
first measurement happens at/after `play()`, which awaits
`document.fonts.ready`. The track moves via `transform: translateX` (rAF on
the injectable `RuntimeClock`; transforms are direction-agnostic under CSS
`direction`, so motion is deterministic). No per-frame relayout: positions are
absolute offsets computed from measured widths; only the track transform
changes per frame.

**Reconcile (`update()`):** match by stable `id`. Visible nodes keep position;
removed-but-visible items scroll out naturally (they are simply never fed
again); new items enter at their list position on the next feed; an existing
id with changed text is corrected in place — re-measured, leading edge fixed,
downstream kept nodes and recorded seams shifted by exactly the width delta
(track-offset compensation). A re-feed never starts behind the entering edge
(a shrunk edit leaves a one-off wider gap instead of popping a node in
mid-band). Bare `string[]` payloads get positional ids (`item-<index>`) as a
degraded fallback — documented as jump-free only for appends. A reconcile
recomputes the logical cycle width for future cycle-boundary math — and
because a reconcile can resume mid-list, pass-boundary projection derives the
next un-fed wrap from the feeder's real state (`nextOffset` + the width of
the items left in the cycle), never from multiples of the cycle width; the
in-flight pass keeps its already-scheduled duration (the next pass picks up
the new width — per-pass recompute is the D-020 contract).

## D4. RTL model: `direction` is the reading direction

`direction: 'rtl'` (Persian default) = items laid out right-to-left (first
item enters at the band's left edge first… i.e. the track's *content head* is
its visual right end) and the track moves **visually left→right**, mirroring
the English convention and matching the news starter
(`news.ts`: "the line travels left → right, entering off the left edge").
`'ltr'` is the exact mirror. No `'auto'` — explicit only (the runtime's
existing `'auto'` ⇒ LTR-container behaviour is a footgun for a ticker).

Because items are absolutely positioned from measured offsets, inter-item
ordering is fixed **by construction** — inline-flow bidi reordering across
item boundaries cannot happen. Each item span still gets the element's
direction (CSS `direction`, the runtime's existing convention) and
`unicode-bidi: isolate` so weak/neutral characters at an item's edges resolve
inside the item, and embedded LTR runs (brand names, numbers) shape correctly
within RTL text via the browser's native HarfBuzz shaping (ADR 0003).
Separators render as their own neutral spans between items, never concatenated
into item strings.

## D5. List field: extensible item shape

`ListFieldSchema` items are objects with a **required `id: string`** and open
extra fields (Zod passthrough), so the same field type serves the ticker
(`text`), the repeater (D-030: `{ id, name, number, … }`), and sequence items
(D-029: `{ id, text, repeat? }`) without a breaking change later. The ticker
reads `item.text` (missing ⇒ empty string). `FieldValue` widens with the item
array. GDD maps a list field to a typed `array` property whose `items` is an
open `object` schema with the known keys declared (exact `gddType` verified
against the GDD meta-schema during implementation). JSON is the canonical wire
format; the legacy CasparCG XML path (flat string map) cannot express a list.

## D6. Preview font fix ships now

`applyScene` in `platform/preview.ts` currently fires `applyFontFaces()`
fire-and-forget *after* `runtime.ready`, so a first pass could measure
`asset-*` fonts against fallback metrics. Reorder: load + `await` the font
faces **before** constructing/playing the runtime (failures still degrade
gracefully via the existing `cg-preview-error` net — a broken font must not
brick the preview). Note: code inside `preview.ts`'s `#buildHtml` template
literal must respect the known escaping constraints (no backticks, `\${`,
double-escaped `\\n`).

## D7. What stays out of v1

- No per-item pacing/dwell (PRD's old "per-item pacing" wording is superseded
  by constant px/s speed — the measured-width model).
- No vertical ticker (the schema's band model doesn't preclude one later).
- No emptying-band exit: with `repeat: N` the treadmill stays seamless, so the
  final outro plays over cycle N+1's head entering — accepted.
- No D-034 per-pass events (not needed: per-pass duration recompute is pull,
  not push).
- Scrub does not move the ticker (wall-clock-driven; `tick(frame)` only
  samples keyframes). The UI states this; making tickers scrubbable would
  require a seekable clock — out of scope.
