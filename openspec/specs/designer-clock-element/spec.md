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
`'persian'`), and an optional `target` — `{ kind: 'duration', ms }` (positive
integer) or `{ kind: 'datetime', iso }` (ISO-8601). `mode: 'countdown'` SHALL
require `target` (schema refinement). The format tokens are
`HH H hh h mm m ss s A a`, tokenized longest-token-first; non-token
characters pass through literally; the LARGEST unit present in the format
absorbs overflow (a no-hours format shows total minutes). In count modes
`hh`/`h` SHALL behave as `HH`/`H` and `A`/`a` SHALL render empty (meridiem is
wall-only); wall uses the machine's local time (`HH` 24-hour, `hh` 12-hour).

#### Scenario: Clock tool inserts a live clock

- **WHEN** the operator picks the Clock tool and clicks the canvas
- **THEN** a clock element is added (default `wall`, format `HH:mm:ss`,
  Persian digits, Vazirmatn) and the authoring canvas shows the current time

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
countdown-datetime) SHALL compute from the clock's real now at each paint.
Wall and datetime clocks SHALL tick from the play cascade onward (visible
during the intro); count runs are keyed to hold entry. A countdown SHALL
clamp at zero (never negative) and resolve `whenComplete()` exactly once per
run; `reset()` mints a fresh promise. Wall and countup SHALL never resolve
completion. The scene-builder's static initial render SHALL show wall = time
at build, countdown = the full target remaining, countup = zero.

#### Scenario: Wall mode ticks the local time

- **WHEN** mode is `wall` during playback
- **THEN** the text ticks once per second with the machine's local time,
  formatted by the format string

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

#### Scenario: Pause freezes; resume is mode-faithful

- **WHEN** `pause()` is called and `resume()` follows
- **THEN** the displayed time freezes in every mode; a relative count
  (countup, duration countdown) continues with no jump, and an absolute
  clock (wall, datetime countdown) resumes showing the true current value

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

The Designer SHALL provide a Clock tool and an inspector section editing
mode, format (with a token hint), digits, and — for countdown — the target
(duration in seconds, or an absolute date-time), alongside the shared text
styling. The clock has NO dynamic fields in v1 (no data-key section). The
inspector SHALL state the clock is time-driven: timeline scrubbing does not
move it (same affordance as the ticker). The playout inspector SHALL offer
the content-driven hold source when the scope contains a countdown clock,
with copy generalized beyond "ticker".

#### Scenario: Scrubbing does not move the clock

- **WHEN** the operator scrubs the timeline over a composition containing a
  clock
- **THEN** the clock's displayed time does not change, and the inspector
  states it is time-driven (same affordance as the ticker)

#### Scenario: A countdown enables the content-driven hold source

- **WHEN** a composition contains a countdown clock (and no ticker)
- **THEN** the playout inspector offers the content-driven hold source, with
  copy generalized beyond "ticker" (ticker passes / countdown reaching zero)

### Requirement: Export parity and GDD neutrality

The single-file HTML export SHALL carry the clock with behaviour identical
to the preview (the bundled runtime ships the driver; no boot wiring). The
clock adds no dynamic fields, so the scene's GDD SHALL be unchanged by the
presence of a clock.

#### Scenario: Preview equals export; GDD unchanged

- **WHEN** the same scene is previewed and exported as single-file HTML
- **THEN** the clock behaves identically (the export carries the driver),
  and the export's GDD is unchanged vs. the same scene without the clock
