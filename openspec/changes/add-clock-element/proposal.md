# Add Digital Clock Element (D-027)

## Why

Clocks are a staple broadcast graphic — time-of-day bugs, countdowns to air,
match timers — and there is no time-driven element today: keyframes cannot
tick real time. The ticker (D-028) built exactly the seams this needs
(per-scope drivers on the self-wire pattern, the injectable `RuntimeClock`,
content-driven hold completion). The clock is the smallest element that
reuses them: a per-element `ClockDriver` repaints a formatted time string
once per second, and a `countdown` reaching zero participates in the scope's
`holdSource: 'content-driven'` hold alongside finite tickers, so an
`auto-out` composition exits exactly at 00:00.

## What Changes

- **Schema (`@cg/shared-schema`):** new `ClockElement` (`type: 'clock'`):
  text styling mirroring the ticker's subset (`font`, `color`, optional
  `colorFill`/`textShadow`/`backgroundColor`/`backgroundFill`/
  `cornerRadius`/`padding`), `align: 'start' | 'center' | 'end'` (default
  `'center'`), `mode: 'wall' | 'countup' | 'countdown'`, `format` string
  (default `'HH:mm:ss'`; tokens `HH H hh h mm m ss s A a` + literal text),
  `digits: 'latin' | 'persian' | 'arabic-indic'` (default `'persian'`), and
  optional `target` — `{ kind: 'duration', ms }` or
  `{ kind: 'datetime', iso }`. A refinement requires `target` when mode is
  `'countdown'`. Added to the element unions. Additive — no migrations.
- **Runtime (`@cg/template-runtime`):**
  - A pure formatter module (`clock-format.ts`): longest-token-first
    tokenization, non-token characters pass through literally, the LARGEST
    unit present absorbs overflow (`mm:ss` → `90:00`), count modes treat
    `hh`/`h` as `HH`/`H` and render `A`/`a` empty (meridiem is wall-only),
    digits mapped LAST via `@cg/text-shaping`
    `persianDigits`/`arabicIndicDigits`.
  - `buildClock` in `scene-builder.ts`: a band box styled like the ticker's
    subset with an inner time span (`direction: ltr`,
    `unicode-bidi: isolate`, `font-variant-numeric: tabular-nums`),
    flex-aligned per `align`; static initial render (wall = now at build,
    countdown = full target remaining, countup = zero); collected on
    `scope.clocks` beside `scope.tickers`.
  - `clock-driver.ts`: `ClockDriver` on the TickerDriver lifecycle surface
    (`start`/`pause`/`resume`/`stop`/`reset`/`destroy`/`whenComplete`,
    injectable `RuntimeClock`), rAF loop repainting ONLY when the formatted
    string changes (≈1 write/second). Relative modes (countup,
    countdown-duration) advance by accumulated ACTIVE time (pause freezes,
    resume continues with no jump); absolute modes (wall,
    countdown-datetime) compute from `clock.now()` each paint (resume shows
    the true current value). Countdown clamps at 0 and resolves
    `whenComplete()` exactly once per run; `reset()` mints a fresh promise;
    a past datetime target paints 0 and resolves immediately on run start.
  - `runtime.ts` wiring, parallel to tickers: the scope's content wait
    becomes `Promise.all` over finite tickers' AND countdown clocks'
    `whenComplete()` (wall/countup are NOT content sources); hold entry
    resets + starts the scope's clocks alongside its tickers; the `play()`
    cascade also resets + starts clocks so wall/datetime tick during the
    intro; pause/resume/stop/settle/remove/destroy cascades include clocks;
    `tick(frame)` untouched (no scrub representation — same as the ticker).
- **Designer:** Clock tool (toolbar + canvas placement), `defaultClock`
  (wall, `'HH:mm:ss'`, Persian digits, Vazirmatn 600/48), `ClockSections`
  in the inspector (Mode / Format with token hint / Digits / countdown
  target editor — duration in seconds or `datetime-local` — plus the
  time-driven note and `TextStyleSection` reuse; NO data-key section: the
  clock has no fields in v1). `PlayoutSection`'s `hasContentElement` also
  admits countdown clocks and the content-driven copy generalizes beyond
  "ticker".
- **Export / GDD:** no changes — the driver ships inside the bundled
  runtime and the clock adds no fields, asserted by test: a clock scene's
  single-file export boots clean and its GDD is unchanged vs. the same
  scene without the clock.

## Capabilities

### New Capabilities

- `designer-clock-element`: the clock element end-to-end — schema, the
  format-string model, the three modes' driver semantics
  (active-time-relative vs absolute), Persian-first digit mapping with a
  width-stable LTR-isolated time span, designer authoring UI, the
  time-driven (no-scrub) affordance, and export/GDD neutrality.

### Modified Capabilities

- `designer-playout-lifecycle`: the content-completion requirement
  generalizes "tickers" to CONTENT SOURCES — the scope's finite tickers AND
  countdown clocks (same `Promise.all`, same hold token, same per-hold-entry
  reset+start); wall/countup clocks are NOT content sources and never extend
  a hold. Every existing scenario is preserved; countdown-only and mixed
  ticker+countdown scenarios are added.

## Impact

- **Schema:** `packages/shared-schema/src/elements.ts` (clock variant +
  unions + refinement).
- **Runtime:** `packages/template-runtime/src/` — new `clock-format.ts`,
  new `clock-driver.ts`, `scene-builder.ts` (`buildClock` + `scope.clocks`
  init sites), `runtime.ts` (content-source `Promise.all`, hold-entry +
  play-cascade reset/start, lifecycle cascades), `README.md` (doc-sync).
- **Designer:** canvas toolbar/overlay (tool + placement),
  `state/element-defaults.ts` (`defaultClock`),
  `features/inspector/StyleSection.tsx` (`ClockSections`),
  `features/inspector/PlayoutSection.tsx` (`hasContentElement` + copy),
  any element-type switch that must learn `'clock'` (timeline icon etc.).
- **Tests:** formatter table-driven unit tests; driver unit tests
  (injected clock, no real rAF); runtime lifecycle tests (countdown-only,
  mixed ticker+countdown, wall/countup never hold, hard stop preserved);
  scene-builder static-render coverage; designer sibling suites; E2E
  `clock.spec.ts` via the shared fixtures.
- **Docs:** `packages/template-runtime/README.md` (ClockDriver section,
  content-completion wording), `docs/engines/overview.md` if it mentions
  ticker-only completion.
- **Dependencies:** D-028 (ticker — self-wire pattern, `RuntimeClock`,
  `holdSource` axis). No new packages.

## Out of scope (v1)

Date tokens (Jalali `dateFa` already exists in `@cg/text-shaping` for
later), blinking separator, timezone offset, field/`update()`-driven target,
overrun count-up after zero, starter template. Recorded in `design.md`.
