# runtime-ui — delta (the date and time control; the station's Lunar Hijri day — DELTA-RUN-NEXT-VERSION-01-B, -C)

## ADDED Requirements

### Requirement: CG Control SHALL type a date and time in segments, in three calendars

CG Control's date and time control SHALL be the same contract as the Designer's (rules in
`@cg/text-shaping`): typed segments `YYYY / MM / DD` and `HH : MM : SS`, 24-hour, in any digit set,
↑ / ↓, Tab, paste, a refused impossible date, a month grid and `+1 min` / `+5 min` / `+1 h`; Solar
Hijri by default, Gregorian and Lunar Hijri on request, the choice remembered in this browser
(`cg.runtime.calendar.v1`), the other two calendars' dates shown as facts. The Lunar Hijri reading
SHALL take the station's day adjustment. It SHALL work keyboard-only and at 200 % zoom, and in a
right-to-left page the date SHALL still read year / month / day left to right.

#### Scenario: One instant in three calendars

- **WHEN** the operator types `1405/12/29 21:45:00` in Solar Hijri and switches to Gregorian, then
  Lunar Hijri
- **THEN** the segments read 2027/03/20 and 1448/10/12 — the same instant, nothing re-stored

#### Scenario: The control fits at 200 %

- **WHEN** the console is zoomed to 200 %, and then turned right-to-left
- **THEN** no segment clips its digits, none leaves the Inspector, and the year stays first

### Requirement: Station setup's Calendar SHALL set the station's Lunar Hijri day adjustment

Station setup SHALL offer a **Calendar** pane (Content group) holding the station's Lunar Hijri day
adjustment, −2 … +2 days, kept by CG Bridge (`calendar.get` / `calendar.set` / `calendar.changed`,
`calendar.json` beside the templates) and applied to the reading and entry of Lunar Hijri dates
only. It SHALL save as it is pressed (`calendar.set`, a `station-admin` route) with no Apply. A
principal who is not a station-admin SHALL see the value in force as a fact with no control, under
the read-only legend every station-admin pane shows such a principal. The pane SHALL state which
calculation this engine uses and today's Lunar Hijri date as the adjustment reads it.

#### Scenario: A station-admin adjusts; an operator reads

- **WHEN** a station-admin presses `+1 day` in Calendar
- **THEN** it is saved at once, today's Lunar Hijri fact moves by a day, and every console's Lunar
  Hijri reading follows
- **WHEN** an operator opens Calendar
- **THEN** the adjustment is a fact, with no chips and no Apply
