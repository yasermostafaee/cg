# Design — add-ticker-element

## D1. The runtime self-wires per-scope content completion

**Decision:** `createRuntime` detects ticker elements per field scope and
installs that scope's `waitForContent` supplier on its `PlayoutController`:
`Promise.all` over the scope drivers' `whenComplete()`. All finite tickers
done ⇒ the hold ends; an infinite ticker never resolves ⇒ the scope holds
until `stop()`; a scope with NO content elements supplies `null` ⇒ a
**zero-length hold deferred like a 0ms timer** (a zero-hold root must not
settle before its children receive the play cascade). An explicitly passed
`RuntimeBootOptions.contentHold` overrides the ROOT scope (the external
override/test seam). Precedence: explicit boot option → internal ticker
completion → no content (= deferred zero-length holds).

**Why:** nothing in production supplies external wiring today, and the
exported single-file HTML boots with `CG.createRuntime(scene)` — no options at
all (`ExporterSingleFile.ts`, emitted boot script). Threading a seam
externally would require editing two emitted-HTML template strings
(single-file + `.vcg` index) *and* the preview, and would still be
root-scope-only. Self-wiring makes preview, single-file export, and `.vcg`
correct with zero boot-code changes and lets a ticker inside a nested
composition govern that child scope's holds.

**Multiple tickers in one scope:** `Promise.all` — the hold ends when ALL
the scope's finite tickers complete (the longest run governs by construction);
no ticker's content is ever cut off mid-run.

## D2. Two nested loops + the `holdSource` axis

The old model — "`durationHook` returns the ms until the current content cycle
completes; the composition's `repeat` counts crawl passes; the treadmill rolls
continuously across pass boundaries" — is **superseded**. The approved model:

- **INNER loop — the ticker's own:** `TickerElement.repeat: 'infinite' | N`
  (default `'infinite'`) crawl passes per run, with
  `cycleBoundary: 'seamless' | 'drain'` deciding the seam between passes. A
  finite run ends **cleanly**: feeding stops after the Nth pass's last item
  and the run completes only when that item has fully exited the band — never
  cut mid-scroll. `'drain'` additionally empties the band BETWEEN passes.
- **OUTER loop — the composition's:** `mode` keeps answering "how many
  open/close cycles" (`manual` / `auto-out` / `loop-cycle`;
  `'content-driven'` is **no longer a mode**). The orthogonal
  `holdSource: 'timed' | 'content-driven'` answers what ends each hold:
  `'timed'` = `holdMs` (unchanged); `'content-driven'` = until the scope's
  tickers complete (D1). The acceptance example: `loop-cycle, repeat: 3` +
  `holdSource: 'content-driven'` + ticker `repeat: 2` ⇒ 2 crawl passes per
  hold, the full open/close between, 3 cycles ⇒ content seen 6×.
- **Fresh run per hold:** `onHoldStart` does RESET + START — each composition
  open/close cycle replays the crawl from its entering edge. The treadmill is
  continuous WITHIN one hold only (the old "rolls continuously across pass
  boundaries / `start()` is idempotent across passes" invariant is
  superseded; pass boundaries are now the ticker's own, inside one hold).
- **Hold-token guard:** a stale completion (resolving after `stop()` or after
  the hold already ended) is ignored — it can never replay the outro or
  settle the scope a second time.
- **Legacy normalization:** a stored `mode: 'content-driven'` normalizes via
  `z.preprocess` at parse time — and defensively in `playoutOf()` for
  unparsed scenes handed straight to `createRuntime` — to
  `mode: 'loop-cycle', holdSource: 'content-driven'`; behaviourally faithful
  for every pre-D-028 scene (none had tickers ⇒ zero-length holds in both
  forms). A registry migration is deferred — `migrate()` currently has no
  production call site.
- Tickers also crawl under `timed`/`manual` holds (band holds, crawl rolls
  until the hold ends / `stop()`): the driver is started by the scope's hold
  entry and stopped by settle, independent of `holdSource`; only the *wait*
  is `content-driven`-specific.
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
cached per text — first measured at/after `play()` (which awaits
`document.fonts.ready`) and **re-measured once per content cycle**: the cache
clears each time a lap completes, so a width measured mid-font-swap (an
`update()` whose text first triggers a lazy `unicode-range` face — `update()`
never re-awaits fonts) self-heals within one cycle instead of poisoning the
crawl. Fed nodes keep their bookkept widths (layout stays self-consistent);
only future feeds and cycle math pick up corrected metrics. The track moves via `transform: translateX` (rAF on
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
recomputes the logical cycle width for future cycle-boundary math. Completion
bookkeeping is feeder-state-driven: a finite run stops feeding after the Nth
pass's last item and records that item's final end offset; the run completes
when the crawl distance crosses `finalEnd + viewportWidth` (the last item has
fully exited the band). There is no pass-duration projection —
`passRemainingMs()` and the seam-projection math are deleted.

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
- No mid-scroll cut, ever: a finite run always END-drains — feeding stops
  after pass N and completion waits for the last item to fully exit the band,
  so no N+1 head ever enters and the outro never plays over a chopped crawl;
  `cycleBoundary: 'drain'` extends the same emptying to the seams BETWEEN
  passes. (Supersedes the earlier "final outro plays over cycle N+1's head —
  accepted" trade-off.)
- A finite ticker under a **timed** hold is authored intent (the timer ends
  the hold regardless of crawl progress); export preflight surfaces an
  info-level `ticker-finite-with-timed-hold` so the combination is deliberate,
  never a silent surprise.
- No D-034 per-pass events (not needed: per-pass duration recompute is pull,
  not push).
- Scrub does not move the ticker (wall-clock-driven; `tick(frame)` only
  samples keyframes). The UI states this; making tickers scrubbable would
  require a seekable clock — out of scope.
