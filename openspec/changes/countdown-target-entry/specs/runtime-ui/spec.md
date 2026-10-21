## MODIFIED Requirements

### Requirement: CG Control SHALL type a date and time in segments, in three calendars

CG Control's date and time control SHALL be the same contract as the Designer's (rules in
`@cg/text-shaping`): typed segments `YYYY / MM / DD` and `HH : MM : SS`, 24-hour, in any digit set,
↑ / ↓, Tab, paste, a refused impossible date, a month grid and `+1 min` / `+5 min` / `+1 h`; Jalali
by default, Gregorian and Lunar Hijri on request, the choice remembered in this browser
(`cg.runtime.calendar.v1`, Jalali stored as `solar-hijri`), the other two calendars' dates shown as
facts. The solar calendar SHALL be called `Jalali` on every button, fact and tooltip. The Lunar Hijri
reading SHALL take the station's day adjustment. It SHALL work keyboard-only and at 200 % zoom, and in
a right-to-left page the date SHALL still read year / month / day left to right.

#### Scenario: One instant in three calendars

- **WHEN** the operator types `1405/12/29 21:45:00` in Jalali and switches to Gregorian, then
  Lunar Hijri
- **THEN** the segments read 2027/03/20 and 1448/10/12 — the same instant, nothing re-stored

#### Scenario: The calendars are Jalali, Gregorian and Lunar Hijri

- **WHEN** the control is shown
- **THEN** its calendar buttons read `Jalali`, `Gregorian`, `Lunar Hijri`, and the facts beside a
  Gregorian reading name `Jalali`

#### Scenario: The control fits at 200 %

- **WHEN** the console is zoomed to 200 %, and then turned right-to-left
- **THEN** no segment clips its digits, none leaves the Inspector, and the year stays first
