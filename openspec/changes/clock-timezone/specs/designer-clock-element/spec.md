# designer-clock-element (delta)

## MODIFIED Requirements

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
