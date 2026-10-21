# A countdown's target, entered as the owner asked (RUN-NEXT-VERSION-03 Part 2)

## Why

The owner checked a book + countdown template in CG Control on 2026-10-21 (`dev` `c23b1ce`, browser dev
servers). The countdown's target was six separate boxes; he wants one date input and one time input, each
masked so a wrong value cannot be typed, each with a picker. He reported that switching the calendar to
Solar Hijri was very slow while Gregorian ↔ Lunar Hijri was instant. And his word for the solar calendar
is **Jalali**.

## What Changes

- **2.3 — `Solar Hijri` is called `Jalali`** wherever a person reads it, in both apps: the calendar
  buttons and options, the facts beside the field, their tooltips. One label (`CALENDAR_LABELS`,
  `@cg/text-shaping`) feeds every surface. Stored values are unchanged: the id stays `solar-hijri`, so a
  browser's remembered choice (`cg.runtime.calendar.v1`, `cg.designer.calendar.v1`) and every stored
  value keep their spelling.

## Impact

- **Specs:** `designer-clock-element` (MODIFIED), `runtime-ui` (MODIFIED).
- **Code:** `@cg/text-shaping` (`CALENDAR_LABELS`); both apps read it unchanged.
- **Stored values / wire:** unchanged.
