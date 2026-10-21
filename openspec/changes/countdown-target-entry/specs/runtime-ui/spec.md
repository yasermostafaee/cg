## MODIFIED Requirements

### Requirement: CG Control SHALL type a date and time in segments, in three calendars

CG Control's date and time control SHALL be the same contract as the Designer's (rules in
`@cg/text-shaping`, behaviour in `@cg/gesture`): ONE date input masked `YYYY/MM/DD` in the calendar
shown and ONE time input masked `HH:MM:SS`, 24-hour, each followed by its picker — a calendar icon
opening the month (right to left for Jalali and Lunar Hijri) and a clock icon opening hours, minutes,
seconds and `Now`, in the console's anchored panel — digits in any set, the separators the mask's, a
value that cannot exist refused with its reason (month 13, the 31st of a 30-day month, 25 o'clock), a
digit typed in the middle overwriting that position, ↑ / ↓ on the part under the caret, paste, and
`+1 min` / `+5 min` / `+1 h`; Jalali by default, Gregorian and Lunar Hijri on request, the choice
remembered in this browser (`cg.runtime.calendar.v1`, Jalali stored as `solar-hijri`), the other two
calendars' dates shown as facts. The solar calendar SHALL be called `Jalali` on every button, fact and
tooltip. Every calendar switch SHALL show at once — the switch back to the first calendar shown
included. The Lunar Hijri reading SHALL take the station's day adjustment. It SHALL work
keyboard-only, at 1280×720 and at 200 % zoom, and in a right-to-left page the date SHALL still read
year / month / day left to right.

#### Scenario: One instant in three calendars

- **WHEN** the operator types `1405/12/29 21:45:00` in Jalali and switches to Gregorian, then
  Lunar Hijri
- **THEN** the inputs read 2027/03/20 and 1448/10/12 — the same instant, nothing re-stored

#### Scenario: The calendars are Jalali, Gregorian and Lunar Hijri

- **WHEN** the control is shown
- **THEN** its calendar buttons read `Jalali`, `Gregorian`, `Lunar Hijri`, and the facts beside a
  Gregorian reading name `Jalali`

#### Scenario: The owner's refusals

- **WHEN** the operator types `1405/13/40` into the date and `25:61` into the time
- **THEN** each is refused with its reason (`There is no month 13.`, `Hours run from 00 to 23.`) and
  nothing is staged

#### Scenario: Every switch shows at once

- **WHEN** the operator clicks Gregorian, Lunar Hijri, then Jalali
- **THEN** each switch is shown on its own click — in Chrome, 2–4 ms from the press — with no other
  event needed

#### Scenario: The pickers

- **WHEN** the operator picks a day from the calendar icon's month and a minute from the clock icon
- **THEN** the date takes the day and keeps its time, the time takes the minute, and `Now` sets now

#### Scenario: The control fits at 200 %

- **WHEN** the console is at 1280×720, zoomed to 200 %, and then turned right-to-left
- **THEN** neither input clips its digits, none leaves the Inspector, the year stays first, and each
  picker opens inside the window
