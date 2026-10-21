## MODIFIED Requirements

### Requirement: A date and time the author types

The countdown's time-of-day and date-and-time targets SHALL be typed in SEGMENTS — `YYYY / MM / DD`
and `HH : MM : SS`, 24-hour — through ONE shared control used by the Designer and CG Control (an app
primitive, never the browser's own picker): each segment SHALL take digits in any of the three sets,
↑ / ↓ SHALL step it, Tab SHALL move on and a pasted date or time SHALL fill every segment it names; a
value out of a segment's range SHALL be REFUSED, never clamped into a different time. A month grid
and `+1 min` / `+5 min` / `+1 h` SHALL be one click away.

Three calendars SHALL be offered — Jalali (the default), Gregorian and Lunar Hijri — the choice
remembered per person, with the other two calendars' dates shown as FACTS. The solar calendar SHALL be
called `Jalali` wherever a person reads it; its stored id SHALL stay `solar-hijri`, so a remembered
choice and every stored value keep their spelling. Jalali SHALL use the arithmetic calendar; Lunar
Hijri SHALL use the platform's Umm al-Qura calendar (falling back to the civil, then the tabular,
calculation) and SHALL take a day adjustment of −2 … +2. What is STORED SHALL never depend on the
calendar shown: an ISO instant with the machine's offset, or `HH:mm[:ss]`. The control SHALL work
keyboard-only, at 200 % text and in a right-to-left page.

#### Scenario: Switching the calendar changes what is shown, never what is stored

- **WHEN** the author switches the calendar from Jalali to Gregorian
- **THEN** the segments re-read the same instant and nothing is committed

#### Scenario: The solar calendar is called Jalali

- **WHEN** the author opens the calendar choice
- **THEN** it offers `Jalali`, `Gregorian` and `Lunar Hijri`, and Jalali's stored value is `solar-hijri`

#### Scenario: An out-of-range segment is refused

- **WHEN** the author types `13` into the month
- **THEN** the stored value is unchanged and the segment shows the stored month again

#### Scenario: The control fits at 200 % text

- **WHEN** the page's text is at 200 %
- **THEN** no segment clips its digits and the control stays inside the Inspector
