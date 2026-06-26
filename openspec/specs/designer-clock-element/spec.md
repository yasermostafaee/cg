# designer-clock-element Specification

## Purpose

TBD - created by archiving change add-clock-element. Update Purpose after archive.

## Requirements

### Requirement: Clock element with format-driven time text

The schema SHALL define a `clock` element that renders live time as text
(geometry from the base transform), styled with the ticker's text-styling
subset (`font`, `color`, optional `colorFill`/`textShadow`/
`backgroundColor`/`backgroundFill`/`cornerRadius`/`padding`) plus
`align: 'start' | 'center' | 'end'` (default `'center'`), configured by
`mode: 'wall' | 'countup' | 'countdown'`, a `format` string (default
`'HH:mm:ss'`), `digits: 'latin' | 'persian' | 'arabic-indic'` (default
`'persian'`), an optional `target` — `{ kind: 'duration', ms }` (positive
integer) or `{ kind: 'datetime', iso }` (ISO-8601) — and an optional
`timezone` (an IANA zone name, e.g. `'Europe/London'`) that, when set, makes
`wall` mode render that zone's current time (absent ⇒ machine-local). `mode:
'countdown'` SHALL require `target` (schema refinement). The format tokens are
`HH H hh h mm m ss s A a`, tokenized longest-token-first; non-token
characters pass through literally; the LARGEST unit present in the format
absorbs overflow (a no-hours format shows total minutes). In count modes
`hh`/`h` SHALL behave as `HH`/`H` and `A`/`a` SHALL render empty (meridiem is
wall-only); wall uses the machine's local time (`HH` 24-hour, `hh` 12-hour) —
or, when `timezone` is set, the current time in that IANA zone. The optional
`timezone` SHALL be additive and backward-compatible: a clock authored without
it parses and renders exactly as before (no schema-version bump, no migration).
An invalid or unknown `timezone` (a hand-edited or externally-produced scene —
the schema does not validate IANA names) SHALL degrade to local time, never
throw: scene-build and the per-frame paint must not crash on a bad zone.

#### Scenario: An unknown time zone degrades to local time

- **WHEN** a clock carries a `timezone` that is not a valid IANA name
- **THEN** the wall clock renders the machine's local time instead, and neither
  the authoring canvas build nor the live paint loop throws

#### Scenario: Clock tool inserts a live clock

- **WHEN** the operator picks the Clock tool and clicks the canvas
- **THEN** a clock element is added (default `wall`, format `HH:mm:ss`,
  Persian digits, Vazirmatn, no `timezone`) and the authoring canvas shows the
  current local time

#### Scenario: The largest present unit absorbs overflow

- **WHEN** a 90-minute countdown renders through format `mm:ss`
- **THEN** the display starts at `90:00` (total minutes — no hours unit to
  carry into) and non-token characters (the `:`) pass through literally

### Requirement: Three modes — wall, countup, countdown

The runtime SHALL drive the clock with a per-element driver on the ticker's
self-wire pattern (lifecycle surface
`start`/`pause`/`resume`/`stop`/`reset`/`destroy`/`whenComplete`, injectable
`RuntimeClock`, rAF loop) that repaints ONLY when the formatted string
changes (≈1 DOM write/second). Relative modes (countup, countdown-duration)
SHALL advance by accumulated ACTIVE time; absolute modes (wall,
countdown-datetime) SHALL compute from the clock's real now at each paint —
and `wall` SHALL compute the displayed hour/minute/second in the element's
`timezone` (via `Intl.DateTimeFormat({ timeZone })`) when set, otherwise in the
machine-local zone; the format string, 12-hour/meridiem rules, and digit
mapping apply identically afterwards. Wall and datetime clocks SHALL tick from
the play cascade onward (visible during the intro); count runs are keyed to
hold entry. A countdown SHALL clamp at zero (never negative) and resolve
`whenComplete()` exactly once per run; `reset()` mints a fresh promise. Wall
and countup SHALL never resolve completion. `countup` and `countdown` SHALL
ignore `timezone` entirely. The scene-builder's static initial render SHALL
show wall = time at build (in `timezone` when set), countdown = the full
target remaining, countup = zero.

#### Scenario: Wall mode ticks the local time

- **WHEN** mode is `wall` during playback and no `timezone` is set
- **THEN** the text ticks once per second with the machine's local time,
  formatted by the format string

#### Scenario: Wall mode renders a selected time zone

- **WHEN** mode is `wall` and `timezone` is set to an IANA zone (e.g.
  `Asia/Tokyo`)
- **THEN** the text shows the current time in that zone, with the authored
  format string and digit script (Persian by default) applied unchanged

#### Scenario: Count modes ignore the time zone

- **WHEN** mode is `countup` or `countdown` (with any `timezone`)
- **THEN** the count is unaffected by `timezone` — countup advances in active
  time and countdown tracks its target exactly as before

#### Scenario: Countup restarts from zero each hold entry

- **WHEN** mode is `countup` under a `loop-cycle` composition
- **THEN** the count starts at zero at each hold entry and counts up in
  ACTIVE (unpaused) time until `stop()`; each cycle restarts it from zero

#### Scenario: Countdown to a duration clamps and completes at zero

- **WHEN** mode is `countdown` with a `duration` target
- **THEN** the display starts at the full duration, counts down in active
  time during the hold, clamps at zero (never negative), and signals
  completion exactly at 00:00; each `loop-cycle` cycle re-runs the full count

#### Scenario: Countdown to a datetime tracks the real deadline

- **WHEN** mode is `countdown` with a `datetime` target
- **THEN** remaining = target − real now (pause does not delay a real
  deadline), clamping at zero and signalling completion; a target already in
  the past completes immediately (zero-length content hold)

### Requirement: Persian-first digits, bidi-isolated, width-stable

The clock's digit mapping SHALL go through `@cg/text-shaping`
(`persianDigits`/`arabicIndicDigits`), applied LAST (after all formatting).
The rendered time span SHALL stay LTR (`direction: ltr` +
`unicode-bidi: isolate`) inside RTL layouts and SHALL use
`font-variant-numeric: tabular-nums` so the width is stable as digits tick.

#### Scenario: Persian and Arabic-Indic digits map via text-shaping

- **WHEN** digits is `persian` (default) or `arabic-indic`
- **THEN** digits map via `@cg/text-shaping`, the time string stays LTR
  (bidi-isolated) inside RTL layouts, and width is stable (tabular numerals)

### Requirement: Designer authoring — time-driven, not scrubbed

The Designer SHALL provide a Clock tool and an inspector section editing mode, format (with a token hint), digits, and — for countdown — the target (duration in seconds, or an absolute date-time), alongside text styling (font, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO background, box padding, border-radius, or stroke/path-style controls (D-056 — the clock carries only its text; box styling belongs on a separate shape layer). The clock has NO dynamic fields in v1 (no data-key section). The inspector SHALL state the clock is time-driven: timeline scrubbing does not move it (same affordance as the ticker). The playout inspector SHALL offer the content-driven hold source when the scope contains a countdown clock, with copy generalized beyond "ticker".

#### Scenario: Scrubbing does not move the clock

- **WHEN** the operator scrubs the timeline over a composition containing a clock
- **THEN** the clock's displayed time does not change, and the inspector states it is time-driven (same affordance as the ticker)

#### Scenario: A countdown enables the content-driven hold source

- **WHEN** a composition contains a countdown clock (and no ticker)
- **THEN** the playout inspector offers the content-driven hold source, with copy generalized beyond "ticker" (ticker passes / countdown reaching zero)

#### Scenario: The clock inspector exposes no box styling

- **WHEN** a clock is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)

### Requirement: Export parity and GDD neutrality

The single-file HTML export SHALL carry the clock with behaviour identical
to the preview (the bundled runtime ships the driver; no boot wiring). The
clock adds no dynamic fields, so the scene's GDD SHALL be unchanged by the
presence of a clock.

#### Scenario: Preview equals export; GDD unchanged

- **WHEN** the same scene is previewed and exported as single-file HTML
- **THEN** the clock behaves identically (the export carries the driver),
  and the export's GDD is unchanged vs. the same scene without the clock

### Requirement: Vertical alignment of the time text

The clock SHALL expose a `verticalAlign` (top / middle / bottom) that positions the time text vertically within the box via flex `align-items` (top → `flex-start`, middle → `center`, bottom → `flex-end`), independently of its existing horizontal `align` (which stays on `justify-content`). It SHALL default to `'middle'` so a clock authored before this change renders vertically centred exactly as today (non-breaking, no migration). `verticalAlign` SHALL NOT be keyframe-able.

#### Scenario: Vertical align positions the time text via flex

- **WHEN** a clock's `verticalAlign` is set to top or bottom
- **THEN** the time text is placed at that vertical edge of the box (flex `align-items` `flex-start` / `flex-end`) while its horizontal `align` is unaffected

#### Scenario: A pre-D-045 clock stays vertically centred

- **WHEN** a clock authored before this change (no `verticalAlign`) is loaded or rendered
- **THEN** `verticalAlign` defaults to `'middle'` and the time text renders vertically centred exactly as today

### Requirement: Blinking colon separator

The clock SHALL support an OPTIONAL blinking colon, configured by two schema fields: `blinkColon`
(boolean) and `blinkPeriodMs` (positive integer, default 1000). Both default to absent — a clock
without them renders steady colons exactly as before, so the addition is backward-compatible (no
schema-version bump, no migration). When `blinkColon` is on, the runtime SHALL render the formatted
time so that each colon (`:`) character occupies its OWN span, and SHALL pulse ONLY those spans'
OPACITY on/off — never `display`, so there is NO digit reflow or layout shift — with the blink phase
derived from the clock's time source as `Math.floor(now / blinkPeriodMs) % 2` and NO separate timer.
It SHALL apply to `wall`, `countup`, and `countdown`, and SHALL leave Persian / Arabic-Indic digit
mapping unaffected (the colon is never a digit). The Designer preview and the exported single-file
HTML SHALL run the blink identically (the same runtime source). When `blinkColon` is off the colons
SHALL stay steady (the unchanged single-`textContent` render). Changing `blinkPeriodMs` SHALL change
the blink cadence.

#### Scenario: Enabled colon pulses at the configured rate

- **WHEN** a clock has `blinkColon` on
- **THEN** its colon separator(s) pulse on/off (opacity) at the rate set by `blinkPeriodMs`, while
  the digits keep ticking

#### Scenario: Disabled keeps steady colons

- **WHEN** `blinkColon` is off (or absent)
- **THEN** the colons stay steady and the clock renders exactly as before (no segmentation change)

#### Scenario: Only opacity toggles — no layout shift

- **WHEN** the colon blinks
- **THEN** only the colon span's opacity changes; the digits do not reflow or shift position

#### Scenario: Rate change updates the cadence

- **WHEN** `blinkPeriodMs` is changed
- **THEN** the blink speed updates accordingly

#### Scenario: Preview and export match; Persian digits unaffected

- **WHEN** the clock plays in the Designer preview AND in the exported single-file HTML
- **THEN** the blink runs the same (driven by the clock's time source) and Persian digits render
  unchanged
