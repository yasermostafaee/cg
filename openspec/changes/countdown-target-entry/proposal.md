# A countdown's target, entered as the owner asked (RUN-NEXT-VERSION-03 Part 2)

## Why

The owner checked a book + countdown template in CG Control on 2026-10-21 (`dev` `c23b1ce`, browser dev
servers). The countdown's target was six separate boxes; he wants one date input and one time input, each
masked so a wrong value cannot be typed, each with a picker. He reported that switching the calendar to
Solar Hijri was very slow while Gregorian ↔ Lunar Hijri was instant. And his word for the solar calendar
is **Jalali**.

## What Changes

- **Stopped Canvas remains editable.** Wall-clock expiry does not hide countdown digits or apply
  automatic Step visibility changes to the stopped authoring picture. Restore authored base
  visibility without overriding intentional hidden elements; an explicit Step rehearsal remains
  deliberate. Real Canvas Play, Preview and on-air output retain actual deadline/zero semantics.
  Stop returns to the editable authoring state without retargeting or modifying the project.

- **Preview replay follow-up.** Every fresh accelerated Play starts from the current real time,
  rather than the last run's accelerated future. Resume retains its clock; past absolute deadlines
  remain past. Runtime output and stored targets are unchanged. Duration rehearsals replay in full
  without requiring a field edit.

- **2026-11-04 follow-up — Preview parity and complete exit.** Designer Preview derives target
  editors from the same bindings as CG Control and uses its existing masked date/time control.
  Switching a legacy starter's `\\d` time pattern to a date target updates the standard pattern;
  custom author constraints remain unchanged. Advanced timing shows a readable deadline. The direct
  countdown's normal close-on-zero policy gives every visual part an ordinary editable exit
  animation. The later D-179 Azan starter uses a different authored policy: announce at zero and
  remain until manual Stop; it is not a full-screen auto-closing example.

- **2.1 — one masked date input and one masked time input, each with a picker.** `YYYY/MM/DD` in the
  calendar shown and `HH:MM:SS`, 24-hour: digits in any set, the separators the mask's, an impossible
  value refused with its reason (month 13, the 31st of a 30-day month, 25 o'clock), typing in the
  middle, Up / Down on the part under the caret, paste. A calendar icon opens the month (right to left
  for Jalali and Lunar Hijri), a clock icon opens hours / minutes / seconds and `Now`. The rules are
  `@cg/text-shaping`'s (`date-time-mask`), the behaviour `@cg/gesture`'s (`useMaskedDateTime`) — one
  shared implementation for both apps — and the markup stays app-local (`@cg/ui` is tokens-only by
  rule), each app's own primitives: CG Control's `NumericInput` and `Popover`, the Designer's `<input>`
  primitive and a new `ui/Popover` (its first anchored-panel primitive).
- **2.2 — every calendar switch at once.** Cause, measured with real clicks: the switch BACK to the
  first calendar shown (Jalali) did not render until something else re-rendered the control — the
  countdown field's 15-second refresh. The control set state during render beside
  `useSyncExternalStore` (the calendar choice); React 18 then never records the store's new snapshot,
  so a switch back to the first value compares equal and renders nothing. The masked hook sets no
  state during render. Measured after: 2–4 ms from the press. (The calendar conversions were not the
  cause: every one is O(1), and a picker month costs one — pinned by a test.)
- **2.3 — `Solar Hijri` is called `Jalali`** wherever a person reads it, in both apps: the calendar
  buttons and options, the facts beside the field, their tooltips. One label (`CALENDAR_LABELS`,
  `@cg/text-shaping`) feeds every surface. Stored values are unchanged: the id stays `solar-hijri`, so a
  browser's remembered choice (`cg.runtime.calendar.v1`, `cg.designer.calendar.v1`) and every stored
  value keep their spelling.

## Impact

- **Specs:** `designer-clock-element` (MODIFIED), `runtime-ui` (MODIFIED).
- **Code:** `@cg/text-shaping` (`CALENDAR_LABELS`, `date-time-mask`, `pickerMonth`); `@cg/gesture`
  (`useMaskedDateTime`); both apps' `DateTimeInput`; the Designer's `ui/Popover`.
- **Stored values / wire:** unchanged — ISO with the machine's offset, or `HH:mm[:ss]`.
