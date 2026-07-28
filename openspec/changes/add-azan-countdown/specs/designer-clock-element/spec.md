# designer-clock-element — delta (azan countdown: time-of-day target + colour zones, D-141)

## ADDED Requirements

### Requirement: Countdown to a time of day

`ClockTargetSchema` SHALL accept a third target kind,
`{ kind: 'timeofday', time: 'HH:mm' | 'HH:mm:ss' }`, valid only for `mode: 'countdown'`. It
SHALL count down to the NEXT LOCAL occurrence of that time on the rendering machine's clock:
today's occurrence when it is still ahead, otherwise tomorrow's. The local calendar day SHALL be
used to construct the occurrence (so a daylight-saving transition is resolved by the platform,
not by adding a fixed 24 hours), and an occurrence exactly equal to now SHALL count as ARRIVED,
not as a fresh full day.

`timeofday` SHALL be an ABSOLUTE time base like `datetime`: remaining = deadline − real now, a
pause SHALL never delay it, and the clock SHALL tick from the play cascade onward. Like the
countdown family generally it SHALL ignore the element's `timezone`, which remains `wall`-only.

The occurrence SHALL be RESOLVED ONCE PER RUN — at `reset()` / `start()`, and on an explicit
re-target — and PINNED as an absolute deadline for that run; it SHALL NOT be re-resolved per
paint. On reaching the deadline the clock SHALL clamp at zero, resolve `whenComplete()` exactly
once, and stop — it SHALL NOT roll forward to tomorrow's occurrence mid-run. Existing hold,
auto-out, and `drivesHold` semantics SHALL be unchanged.

#### Scenario: Today's occurrence when it is still ahead

- **WHEN** a countdown has `target: { kind: 'timeofday', time: '20:32' }` and local now is 19:00
- **THEN** it shows `01:32:00` remaining and reaches zero exactly at 20:32 local, clamping at
  zero with existing hold / auto-out semantics unchanged

#### Scenario: Tomorrow's occurrence when today's has passed

- **WHEN** local now is past today's target time
- **THEN** the countdown targets tomorrow's occurrence of that time

#### Scenario: The deadline is pinned for the run and never rolls forward

- **WHEN** a `timeofday` countdown reaches zero
- **THEN** the display stays clamped at `00:00`, `whenComplete()` resolves exactly once, and the
  clock does NOT re-resolve to tomorrow's occurrence and jump back to a full day

#### Scenario: A pause never delays a time-of-day deadline

- **WHEN** a `timeofday` countdown is paused and later resumed
- **THEN** it repaints the TRUE current remaining on resume — the deadline kept approaching while
  paused, exactly as a `datetime` target does

### Requirement: A scene field drives the countdown's target time, live

The binding-target union SHALL accept `{ kind: 'clock-target', elementId }`, driven by a `text`
field whose value is `HH:mm` or `HH:mm:ss`. No new dynamic-field TYPE SHALL be introduced: the
value is a text field constrained by the existing `pattern` mechanism (the `Time (HH:MM)`
validation preset), so the exported GDD carries it as a `single-line` string with that pattern
and the Runtime Inspector renders it as an ordinary editable text field with no new control.

The binding SHALL be applied through the clock DRIVER, not the DOM-value walk — the same routing
`sequence-item-text` uses — and SHALL be re-applied on `play()` AND on every `update()`, so a
`CG UPDATE` re-targets the loaded template INCLUDING A LIVE COUNTDOWN without replaying it.

A re-target SHALL re-resolve and re-pin the deadline, re-arm completion when the new deadline is
in the future, repaint immediately, and re-evaluate the active zone — while leaving the RUN
itself untouched (no replay, no reset of the scope's lifecycle, no effect on other elements). A
value that does not parse as a time SHALL apply NOTHING: the current, possibly on-air target is
KEPT and the failure is reported, never a countdown blanked or zeroed by a typo.

Re-targeting a countdown that has ALREADY completed SHALL re-arm the DISPLAY but SHALL NOT
re-open a content-driven hold that has already closed; re-running such a countdown requires a
replay. This limit SHALL be stated in the Designer's inspector copy.

#### Scenario: The operator re-targets a live countdown from the Runtime Inspector

- **WHEN** the `timeofday` target is bound to a scene field and the operator sends a new time via
  `CG UPDATE` while the countdown is running
- **THEN** the Runtime Inspector showed it as an ordinary editable field, and the loaded template
  re-targets to the new time — repainting at once, without being replayed

#### Scenario: An unparseable value keeps the current target

- **WHEN** an update carries a value that is not `HH:mm` / `HH:mm:ss`
- **THEN** nothing is applied — the current (possibly on-air) target is kept — and the failure is
  reported

#### Scenario: A re-target after zero does not re-open a closed hold

- **WHEN** a countdown has already reached zero and closed its scope's content-driven hold, and a
  new target arrives
- **THEN** the display re-arms to the new remaining time, and the already-closed hold stays
  closed (a replay is required to re-run it)

### Requirement: Colour zones on a countdown

A `countdown` clock SHALL accept an optional `zones`: an ordered list of `steps`, each an
`atOrBelowMs` threshold on REMAINING time plus a zone `key` and a zone `color`, and an OPTIONAL
`base` zone (key + colour) that is active while remaining is above the highest threshold.
Thresholds SHALL validate as STRICTLY DECREASING with AT LEAST ONE step, and zone keys SHALL be
unique within a clock. Zone keys SHALL be free-form strings, not a closed enum.

The Designer SHALL offer the 4-zone preset — base plus thresholds at 60, 30 and 10 minutes — and
applying it SHALL also seed the clock's own per-zone text colour, as a single undo entry, so the
preset yields a visibly working countdown rather than a configured-but-inert one.

The active zone SHALL be selected FIRST-MATCH-WINS over the steps in authored order (the first
step whose `atOrBelowMs` is at or above the remaining time), falling back to `base`, or to NO
active zone when `base` is absent. Selection SHALL compare against the SAME one-second quantum
the display paints, so the zone changes on exactly the frame the digits reach the boundary — never
up to a second early. At and after zero the lowest step SHALL remain selected.

Zones SHALL be countdown-only at BOTH layers: the schema SHALL REJECT `zones` on `wall` /
`countup`, and the runtime SHALL IGNORE them for those modes.

All new clock fields SHALL be optional and the target union widening additive, so a scene
authored before this change parses, renders and exports unchanged, with no schema-version bump
and no migration.

#### Scenario: Boundaries validate strictly decreasing, at least one

- **WHEN** the designer authors zone steps whose thresholds are not strictly decreasing, or
  authors zones with no steps
- **THEN** validation fails, identifying the offending step

#### Scenario: The 4-zone preset is offered and seeds the clock's own colours

- **WHEN** the designer applies the 60 / 30 / 10-minute preset
- **THEN** a base zone plus three steps are written AND the clock's own per-zone text colours are
  seeded, as ONE undo entry

#### Scenario: Wall and countup clocks cannot carry zones

- **WHEN** a clock in `wall` or `countup` mode is given `zones`
- **THEN** the schema rejects it, and a hand-edited scene that carries them anyway renders with
  the zones ignored (base styles)

#### Scenario: Existing scenes are untouched

- **WHEN** a scene authored before this change is loaded, previewed and exported
- **THEN** it parses and behaves exactly as before — every new field is optional, the schema
  version is unchanged, and no migration runs

## MODIFIED Requirements

### Requirement: Three modes — wall, countup, countdown

The runtime SHALL drive the clock with a per-element driver on the ticker's
self-wire pattern (lifecycle surface
`start`/`pause`/`resume`/`stop`/`reset`/`destroy`/`whenComplete`, injectable
`RuntimeClock`, rAF loop) that repaints ONLY when the formatted string
changes (≈1 DOM write/second). Relative modes (countup, countdown-duration)
SHALL advance by accumulated ACTIVE time; absolute modes (wall,
countdown-datetime, **countdown-timeofday**) SHALL compute from the clock's real now at each
paint — and `wall` SHALL compute the displayed hour/minute/second in the element's
`timezone` (via `Intl.DateTimeFormat({ timeZone })`) when set, otherwise in the
machine-local zone; the format string, 12-hour/meridiem rules, and digit
mapping apply identically afterwards. Wall and absolute-countdown clocks SHALL tick from
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

#### Scenario: A time-of-day countdown is absolute like a datetime

- **WHEN** mode is `countdown` with a `timeofday` target
- **THEN** it computes from the clock's real now at each paint, ticks from the play cascade
  onward, and a pause does not delay it — the same absolute time base as `datetime`

### Requirement: Designer authoring — time-driven, not scrubbed

The Designer SHALL provide a Clock tool and an inspector section editing mode, format (with a token hint), digits, and — for countdown — the target (duration in seconds, an absolute date-time, or a TIME OF DAY) alongside text styling (font, colour incl. gradient `colorFill`, and a **Text Shadow** section with offset X/Y on one line) — and NO background, box padding, border-radius, or stroke/path-style controls (D-056 — the clock carries only its text; box styling belongs on a separate shape layer).

For a `timeofday` target the inspector SHALL state that the countdown reaches zero at the NEXT LOCAL occurrence of that time, and SHALL offer a Dynamic / Data affordance binding the target to a scene field so the operator can enter each day's official time at playout. This SUPERSEDES the prior "the clock has NO dynamic fields in v1 (no data-key section)": the countdown target is the clock's ONE bindable value, and no other clock property becomes bindable here.

For a `countdown` the inspector SHALL also offer a ZONES editor — an ordered, reorderable list of threshold / key / colour steps plus an optional base zone, validated live (strictly decreasing, at least one, keys unique) with the offending row marked rather than the section refused — and a one-action 4-zone preset (60 / 30 / 10 minutes). The zones editor SHALL appear only for `mode: 'countdown'`.

The inspector SHALL state the clock is time-driven: timeline scrubbing does not move it (same affordance as the ticker). The playout inspector SHALL offer the content-driven hold source when the scope contains a countdown clock, with copy generalized beyond "ticker".

#### Scenario: Scrubbing does not move the clock

- **WHEN** the operator scrubs the timeline over a composition containing a clock
- **THEN** the clock's displayed time does not change, and the inspector states it is time-driven (same affordance as the ticker)

#### Scenario: A countdown enables the content-driven hold source

- **WHEN** a composition contains a countdown clock (and no ticker)
- **THEN** the playout inspector offers the content-driven hold source, with copy generalized beyond "ticker" (ticker passes / countdown reaching zero)

#### Scenario: The clock inspector exposes no box styling

- **WHEN** a clock is inspected
- **THEN** it shows text controls (font, colour incl. gradient, Text Shadow) but NO background, box padding, border-radius, or stroke/path-style controls (D-056)

#### Scenario: A time-of-day target offers a data binding and a zones editor

- **WHEN** a clock's mode is `countdown` and its target kind is `timeofday`
- **THEN** the inspector offers an `HH:mm` / `HH:mm:ss` input, a Dynamic / Data affordance binding the target to a scene field, and the zones editor with its 4-zone preset

#### Scenario: Zones are offered only for countdown

- **WHEN** a clock's mode is `wall` or `countup`
- **THEN** neither the target editor nor the zones editor is shown

### Requirement: Export parity and GDD neutrality

The single-file HTML export SHALL carry the clock with behaviour identical
to the preview (the bundled runtime ships the driver; no boot wiring) — including a `timeofday`
target, its zones, and every zone-driven restyle in the composition subtree, because the export
embeds the scene and boots the same runtime that compiles them.

A clock SHALL add no dynamic fields OF ITS OWN, so a scene's GDD SHALL be unchanged by the mere
presence of a clock. When the designer BINDS a countdown's target to a scene field, that field
SHALL appear in the GDD as the ordinary `text` field it is — a `single-line` string carrying its
`pattern` — introducing no new GDD type, no new `gddType`, and no preflight warning. This
SUPERSEDES the prior unconditional "the clock adds no dynamic fields, so the scene's GDD SHALL be
unchanged by the presence of a clock".

#### Scenario: Preview equals export, including zones

- **WHEN** the same scene is previewed and exported as single-file HTML
- **THEN** the clock behaves identically — the countdown, its zone boundaries and every opted-in
  element's restyle, including elements inside nested composition instances

#### Scenario: An unbound clock leaves the GDD unchanged

- **WHEN** a scene contains a clock whose target is not bound to a field
- **THEN** the export's GDD is unchanged vs. the same scene without the clock

#### Scenario: A bound target appears as an ordinary text field in the GDD

- **WHEN** a countdown's target is bound to a `text` field carrying the time pattern
- **THEN** the GDD carries that field as a `single-line` string with its `pattern`, with no new
  GDD type and no preflight warning
