# designer-clock-element — delta (countdown to a time of day, its target set by the operator, and what it does after zero — D-141, DELTA-RUN-NEXT-VERSION-01-A … -H)

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
field whose VALUE decides what it means: `HH:mm` or `HH:mm:ss` re-aims the countdown at the next
occurrence of that time of day, and an ISO date and time with its offset re-aims it at that exact
instant — its digits written in any of the three sets (Latin, Persian, Arabic-Indic) and read
through `@cg/text-shaping`'s one reader (`parseTimeOfDay` / `parseIsoInstant`). No new
dynamic-field TYPE SHALL be introduced: the field is an ordinary `text` field whose `pattern` follows
its value (`Time (HH:MM[:SS])` or `Date & time (ISO)`), so the exported GDD carries it as a
`single-line` string with that pattern. CG Control SHALL recognise it at import — the field is
marked as a countdown's target, DERIVED from the binding, never authored — and offer the shared date
and time control for it.

A countdown aimed at a time of day or a date and time SHALL expose its target as such a field BY
DEFAULT: switching the target kind SHALL create `targetTime` (the first free `targetTime<n>`),
labelled `Target time`, in the SAME undo entry as the switch. The author's target SHALL be the
field's default and SHALL follow every edit of the target; an author's own pattern SHALL be kept.
The author MAY clear the key to make the target static.

The binding SHALL be applied through the clock DRIVER, not the DOM-value walk — the same routing
`sequence-item-text` uses — and SHALL be re-applied on `play()` AND on every `update()`, so a
`CG UPDATE` re-targets the loaded template INCLUDING A LIVE COUNTDOWN without replaying it.

A re-target SHALL re-resolve and re-pin the deadline, re-arm completion when the new deadline is
in the future, repaint immediately, and re-evaluate the active step — while leaving the RUN
itself untouched (no replay, no reset of the scope's lifecycle, no effect on other elements). A
value that is neither a time nor an ISO instant SHALL apply NOTHING: the current, possibly on-air
target is KEPT and the failure is reported, never a countdown blanked or zeroed by a typo.

Re-targeting a countdown that has ALREADY completed SHALL re-arm the DISPLAY but SHALL NOT
re-open a content-driven hold that has already closed; re-running such a countdown requires a
replay.

#### Scenario: The operator re-targets a live countdown from CG Control

- **WHEN** the target is bound to a scene field and the operator sends a new time via `CG UPDATE`
  while the countdown is running
- **THEN** CG Control offered the date and time control for the field, and the loaded template
  re-targets to the new time — repainting at once, without being replayed

#### Scenario: A time typed on a Persian keyboard re-targets the countdown

- **WHEN** an update carries `۲۰:۳۲` (or `٢٠:٣٢`) for the bound field
- **THEN** the countdown re-targets to 20:32, exactly as it does for `20:32`

#### Scenario: An ISO date and time re-targets to that instant

- **WHEN** an update carries `2026-10-15T21:30:00+03:30` for the bound field
- **THEN** the countdown counts down to that instant, whatever target kind it was authored with

#### Scenario: An unparseable value keeps the current target

- **WHEN** an update carries a value that is neither `HH:mm[:ss]` nor an ISO instant
- **THEN** nothing is applied — the current (possibly on-air) target is kept — and the failure is
  reported

#### Scenario: A re-target after zero does not re-open a closed hold

- **WHEN** a countdown has already reached zero and closed its scope's content-driven hold, and a
  new target arrives
- **THEN** the display re-arms to the new remaining time, and the already-closed hold stays
  closed (a replay is required to re-run it)

#### Scenario: The target is the operator's by default

- **WHEN** the author switches a countdown's target to a time of day
- **THEN** a `Target time` field (`targetTime`) is bound to it with the target as its default, and
  ONE undo removes both
- **WHEN** the author then edits the target
- **THEN** the field's default follows, in the same undo entry

### Requirement: A date and time the author types

The countdown's time-of-day and date-and-time targets SHALL be typed in SEGMENTS — `YYYY / MM / DD`
and `HH : MM : SS`, 24-hour — through ONE shared control used by the Designer and CG Control (an app
primitive, never the browser's own picker): each segment SHALL take digits in any of the three sets,
↑ / ↓ SHALL step it, Tab SHALL move on and a pasted date or time SHALL fill every segment it names; a
value out of a segment's range SHALL be REFUSED, never clamped into a different time. A month grid
and `+1 min` / `+5 min` / `+1 h` SHALL be one click away.

Three calendars SHALL be offered — Solar Hijri (the default), Gregorian and Lunar Hijri — the choice
remembered per person, with the other two calendars' dates shown as FACTS. Solar Hijri SHALL use the
arithmetic calendar; Lunar Hijri SHALL use the platform's Umm al-Qura calendar (falling back to the
civil, then the tabular, calculation) and SHALL take a day adjustment of −2 … +2. What is STORED
SHALL never depend on the calendar shown: an ISO instant with the machine's offset, or
`HH:mm[:ss]`. The control SHALL work keyboard-only, at 200 % text and in a right-to-left page.

#### Scenario: Switching the calendar changes what is shown, never what is stored

- **WHEN** the author switches the calendar from Solar Hijri to Gregorian
- **THEN** the segments re-read the same instant and nothing is committed

#### Scenario: An out-of-range segment is refused

- **WHEN** the author types `13` into the month
- **THEN** the stored value is unchanged and the segment shows the stored month again

#### Scenario: The control fits at 200 % text

- **WHEN** the page's text is at 200 %
- **THEN** no segment clips its digits and the control stays inside the Inspector

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

For a `timeofday` or `datetime` target the inspector SHALL offer the typed date and time control
(see "A date and time the author types"), state as a FACT that a time of day counts to its next
occurrence on the playout machine's clock, and show the data key that makes the target a field the
operator sets — exposed by default as `Target time`. This SUPERSEDES the prior "the clock has NO
dynamic fields in v1 (no data-key section)": the countdown target is the clock's ONE bindable value,
and no other clock property becomes bindable here.

For a `countdown` the inspector SHALL also show its STEPS as a summary with `Edit steps…`, and its
after-zero choice; the steps are edited in the Steps dialog (capability `designer-countdown-steps`).
Neither SHALL appear for `wall` or `countup`.

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

#### Scenario: A time-of-day target offers the typed control, a data binding and the steps

- **WHEN** a clock's mode is `countdown` and its target kind is `timeofday`
- **THEN** the inspector offers the hour and minute segments, the `Target time` data key, and the
  steps summary with `Edit steps…`

#### Scenario: Steps are offered only for countdown

- **WHEN** a clock's mode is `wall` or `countup`
- **THEN** neither the target editor nor the steps are shown

### Requirement: Export parity and GDD neutrality

The single-file HTML export SHALL carry the clock with behaviour identical
to the preview (the bundled runtime ships the driver; no boot wiring) — including a `timeofday`
target, its steps, and every change a step makes in the composition subtree, because the export
embeds the scene and boots the same runtime that compiles them.

A clock whose target is not bound SHALL add no dynamic fields, so a scene's GDD SHALL be unchanged
by the presence of such a clock. When a countdown's target is bound to a scene field — by default
for a time of day or a date and time — that field SHALL appear in the GDD as the ordinary `text`
field it is — a `single-line` string carrying its `pattern` — introducing no new GDD type, no new
`gddType`, and no preflight warning. This SUPERSEDES the prior unconditional "the clock adds no
dynamic fields, so the scene's GDD SHALL be unchanged by the presence of a clock".

#### Scenario: Preview equals export, including steps

- **WHEN** the same scene is previewed and exported as single-file HTML
- **THEN** the clock behaves identically — the countdown, its step thresholds and every change a
  step makes, including elements inside nested composition instances

#### Scenario: An unbound clock leaves the GDD unchanged

- **WHEN** a scene contains a clock whose target is not bound to a field
- **THEN** the export's GDD is unchanged vs. the same scene without the clock

#### Scenario: A bound target appears as an ordinary text field in the GDD

- **WHEN** a countdown's target is bound to a `text` field carrying the time or ISO pattern
- **THEN** the GDD carries that field as a `single-line` string with its `pattern`, with no new
  GDD type and no preflight warning
