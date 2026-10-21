## MODIFIED Requirements

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
