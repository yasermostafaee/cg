# Design — add-clock-element

## D1. Schema: one element, three modes, one optional target

`ClockElementSchema = ElementBaseSchema.extend({ type: z.literal('clock'),
font, color, colorFill?, textShadow?, backgroundColor?, backgroundFill?,
cornerRadius?, padding?, align: z.enum(['start','center','end'])
.default('center'), mode: z.enum(['wall','countup','countdown']),
format: z.string().min(1).default('HH:mm:ss'),
digits: z.enum(['latin','persian','arabic-indic']).default('persian'),
target?: z.union([{ kind: 'duration', ms: positive int },
{ kind: 'datetime', iso: ISO-8601 string }]) })` — the text styling shapes
are the ticker's exact subset (same `font` shape, `HexColor`, `Fill`,
`Shadow`, `Padding`). A `superRefine` requires `target` when `mode` is
`'countdown'` (wall/countup ignore a stray target). Added to the element
union/exports; additive, no migrations (new type).

## D2. Formatter: pure, longest-token-first, largest-unit overflow

A pure module (`clock-format.ts`) so every rule is table-testable without
DOM or timers. Tokens `HH H hh h mm m ss s A a`; tokenization is
longest-token-first; any non-token character passes through literally. The
LARGEST unit present absorbs overflow — a no-hours format shows total
minutes (`mm:ss` → `90:00` for 90 minutes). In count modes `hh`/`h` behave
as `HH`/`H` and `A`/`a` render `''` (meridiem is wall-only); wall uses
local time (`HH` 24h, `hh` 12h). Digit mapping happens LAST, via
`@cg/text-shaping` `persianDigits`/`arabicIndicDigits`, so all arithmetic
and padding operate on Latin digits.

## D3. Driver: TickerDriver's surface, two time bases

`ClockDriver` mirrors TickerDriver — options `{ node, mode, format, digits,
target?, clock?: RuntimeClock }`; methods
`start/pause/resume/stop/reset/destroy/whenComplete`; an rAF loop on the
normalized clock that repaints ONLY when the formatted string changes
(≈1 DOM write/second).

Two time bases, chosen per mode:

- **Relative** (countup, countdown-duration): elapsed = accumulated ACTIVE
  time — pause freezes the accumulator, resume continues with no jump. A
  paused 10s countdown resumes at the same displayed second.
- **Absolute** (wall, countdown-datetime): every paint computes from
  `clock.now()` — pause merely stops painting; resume shows the TRUE
  current value. A real deadline is not delayed by a pause.

Countdown clamps at 0 (never negative) and resolves `whenComplete()`
exactly once per run when 0 paints; `reset()` mints a fresh promise (cf.
TickerDriver), so each loop-cycle hold entry re-runs the full count. A
datetime target already in the past paints 0 and resolves immediately on
its run start (zero-length content hold). Wall and countup never resolve —
they are not content sources.

## D4. Render: static initial paint, LTR-isolated tabular span

`buildClock` (scene-builder): dataset `cgElementId` + `applyBaseStyles`;
the box styled like the ticker band's subset
(background/fill/radius/padding) and flex-aligned per `align`; an inner
time span with `direction: ltr; unicode-bidi: isolate;
font-variant-numeric: tabular-nums` — the time string stays LTR and
width-stable inside RTL layouts. Initial static render so the authoring
canvas is truthful without a driver: wall = now at build time, countdown =
the full target remaining, countup = zero. Built clocks are collected on
`ctx.scope.clocks` (`clocks: []` initialized at every scope-creation site,
beside `tickers`).

## D5. Wiring: content sources = finite tickers + countdown clocks

Exactly parallel to tickers in `runtime.ts`: drivers instantiated per scope
from `scope.clocks`; the scope's content wait = `Promise.all` over [finite
tickers' `whenComplete()`, COUNTDOWN clocks' `whenComplete()`] —
wall/countup are excluded BY CONSTRUCTION (never added to the array), so
they can never extend a content-driven hold. Hold entry (`onHoldStart`)
resets + starts the scope's clocks alongside its tickers — the
`onHoldStart`/`waitForContent` conditions that key off tickers generalize
to "has content elements". Clocks are ALSO reset + started at the `play()`
cascade so wall/datetime tick during the intro (countup/countdown-duration
display their initial value until their hold-entry run begins — the
hold-entry reset makes their count start exactly at the hold).
Pause/resume/stop/settle/remove/destroy cascades include clocks.
`tick(frame)` is untouched: the clock has no scrub representation, same as
the ticker. The hold token and stale-completion guard are reused unchanged.

## D6. Designer: ClockSections, no fields in v1

Tool `{ id: 'clock', label: 'Clock', icon: '◷' }` + canvas placement;
`defaultClock` = wall, `'HH:mm:ss'`, digits `'persian'`, Vazirmatn weight
600 size 48, transform ≈320×84, color `#FFFFFF`, align `'center'`,
transparent background. `ClockSections` in `StyleSection.tsx` modeled on
`TickerSections`: a pinned "Clock" CollapseSection (Mode select; Format
text input with a token hint; Digits select; countdown target editor — a
Duration/Date-time kind toggle, duration edited in SECONDS mapped to
stored ms, datetime via `<input type="datetime-local">` mapped to stored
ISO) + the time-driven note (same wording style as the ticker's) +
`TextStyleSection` reuse for font/color/shadow. NO `DynamicDataSection`
for clocks — the clock has no fields in v1. `PlayoutSection`'s
`hasContentElement` also returns true for `mode: 'countdown'` clocks, and
the content-driven copy generalizes: "until the content completes (ticker
passes / countdown reaching zero)".

## D7. Export/GDD: asserted no-op

No exporter or GDD changes expected — the driver ships inside the bundled
runtime and the clock adds no fields. Asserted by test rather than
assumed: a clock scene's single-file export boots clean, and its GDD is
unchanged vs. the same scene without the clock.

## D8. Out of scope (v1)

- **Date tokens** — Jalali `dateFa` already exists in `@cg/text-shaping`
  for a later date-token pass.
- **Blinking separator.**
- **Timezone offset** (wall is machine-local only).
- **Field/`update()`-driven target** (no dynamic fields on the clock at
  all in v1).
- **Overrun count-up after zero** (countdown clamps at 0, full stop).
- **Starter template.**
