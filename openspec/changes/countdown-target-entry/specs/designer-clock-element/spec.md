## MODIFIED Requirements

### Requirement: A fresh accelerated Preview rehearsal

Each fresh Play in accelerated Designer Preview SHALL begin its virtual clock at the current real
time. Resume SHALL retain the existing virtual clock. The host SHALL NOT shift the authored or bound
deadline; a deadline already in the real past SHALL remain past. Real-time Preview and on-air
runtime SHALL retain actual wall-clock semantics. A session duration override SHALL replay its full
duration without requiring any field edit. The rate selector tooltip SHALL state the replay boundary.

#### Scenario: Replaying after accelerated completion

- **GIVEN** an absolute countdown still five real minutes ahead and Preview at sixty-times speed
- **WHEN** it completes and the author presses Play again without editing anything
- **THEN** the second rehearsal starts with the remaining real time, not at zero
- **AND** the stored target remains unchanged

#### Scenario: An actually past target stays past

- **GIVEN** the absolute countdown target is already in the real past
- **WHEN** the author presses Play twice in accelerated Preview
- **THEN** both runs follow the authored zero behavior without inventing a future target

#### Scenario: A duration override replays in full

- **GIVEN** a three-second Preview duration override has completed
- **WHEN** the author presses Play again without editing anything
- **THEN** the fresh run displays three seconds and completes after its full duration

### Requirement: A date and time the author types

The countdown's time-of-day and date-and-time targets SHALL be typed through ONE shared control used
by the Designer and CG Control (an app primitive, never the browser's own picker): ONE date input,
masked `YYYY/MM/DD` in the calendar shown, and ONE time input, masked `HH:MM:SS`, 24-hour — the rules
in `@cg/text-shaping` (`date-time-mask`), the behaviour in `@cg/gesture` (`useMaskedDateTime`), the
markup app-local. Each input SHALL take digits in any of the three sets and show them in the field's
own; the separators SHALL be the mask's; a key that is not a digit SHALL type nothing; a digit SHALL
overwrite the position under the caret (beginning the part afresh at its start), so a value is edited
in the middle; a value that cannot exist SHALL be REFUSED with its reason — month 13, the 31st of a
30-day month in the calendar shown, 25 o'clock, 61 minutes — never clamped into a different time; ↑ / ↓
SHALL step the part under the caret; a pasted date and/or time SHALL fill what it names. A calendar
icon beside the date SHALL open the month in the calendar shown (right to left for Jalali and Lunar
Hijri), a clock icon beside the time SHALL open hours, minutes and seconds with `Now`, both in the
app's anchored panel; `+1 min` / `+5 min` / `+1 h` SHALL be one click away. A picker month SHALL cost
one calendar conversion and one month length, never one per day.

Three calendars SHALL be offered — Jalali (the default), Gregorian and Lunar Hijri — the choice
remembered per person, with the other two calendars' dates shown as FACTS. The solar calendar SHALL be
called `Jalali` wherever a person reads it; its stored id SHALL stay `solar-hijri`, so a remembered
choice and every stored value keep their spelling. Every calendar switch SHALL show at once. Jalali
SHALL use the arithmetic calendar; Lunar Hijri SHALL use the platform's Umm al-Qura calendar (falling
back to the civil, then the tabular, calculation) and SHALL take a day adjustment of −2 … +2. What is
STORED SHALL never depend on the calendar shown: an ISO instant with the machine's offset, or
`HH:mm[:ss]`. The control SHALL work keyboard-only, at 1280×720, at 200 % text and in a right-to-left
page.

#### Scenario: Switching the calendar changes what is shown, never what is stored

- **WHEN** the author switches the calendar from Jalali to Gregorian
- **THEN** the date input re-reads the same instant and nothing is committed

#### Scenario: The solar calendar is called Jalali

- **WHEN** the author opens the calendar choice
- **THEN** it offers `Jalali`, `Gregorian` and `Lunar Hijri`, and Jalali's stored value is `solar-hijri`

#### Scenario: An impossible value is refused with its reason

- **WHEN** the author types `1405/13/40`, then `25:61`
- **THEN** the month's `3` is refused (`There is no month 13.`), the hour's `5` is refused
  (`Hours run from 00 to 23.`), and the stored value is unchanged

#### Scenario: The pickers

- **WHEN** the author opens the calendar icon on a Jalali date and picks a day, then the clock icon and
  picks a minute, then `Now`
- **THEN** the month reads right to left with the date's day pressed, the date takes the picked day and
  keeps its time, the time takes the minute, and `Now` sets the time to now

#### Scenario: The control fits at 200 % text

- **WHEN** the page's text is at 200 %, and when the page is right to left
- **THEN** neither input clips its digits, the control stays inside the Inspector, and the date reads
  year first, left to right

### Requirement: Preview uses the countdown target's calendar control

Designer Preview SHALL derive countdown-target metadata from the field's own composition bindings,
through the same shared derivation as CG Control. Date targets SHALL use the masked date and time
control, and time-of-day targets SHALL use its masked time control. The target SHALL remain valid
when switching from a standard time pattern, including a legacy `\\d` spelling, to a date target.
Custom authored patterns SHALL remain in force. The Advanced timing deadline SHALL be readable as
a local date/time rather than a raw ISO literal.

#### Scenario: The starter target changes from time of day to date and time

- **WHEN** the author switches the countdown starter target to Date & time and opens Preview
- **THEN** Variables shows the date and time inputs with the calendar picker
- **AND** the generated ISO target raises no pattern validation error
- **AND** changing the calendar does not change the stored instant

### Requirement: The direct countdown starter closes through authored animation

Every visual part of the direct full-screen countdown starter SHALL have an editable exit track.
The content-driven zero completion SHALL run the normal composition outro before the stage clears.
An explicit Preview duration override SHALL replace both the authored deadline and bound target
values for that rehearsal, including subsequent field updates, without changing stored values.

#### Scenario: Rehearsing zero exits the full graphic

- **WHEN** the countdown starter is rehearsed with a three-second duration
- **THEN** reaching zero fades the background and furniture through their exit tracks
- **AND** the stage clears only after that outro completes
