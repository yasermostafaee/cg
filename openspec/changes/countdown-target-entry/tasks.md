# Tasks — countdown-target-entry (RUN-NEXT-VERSION-03 Part 2)

## 2.1 + 2.2 — one masked date input and one masked time input; every switch at once (FULL lane: a shared control on the countdown target's path, both apps)

One commit: 2.2's fix IS a property of the shared hook 2.1 introduces, and the `HEAD` control that
carried the defect is replaced by it.

- [x] 2.2.1 Measured first with `element.click()` in page script (six setups, both apps, built and dev,
      real bridge with PVW rehearsing): every switch ≤ 15 ms — and BLIND: those runs timed the next frame
      and never checked the calendar had changed (a negative without a positive control). With REAL
      clicks and the result read back: the switch to Jalali after Gregorian or Lunar Hijri did not render
      at all; it surfaced on the next unrelated render (typing; on the owner's screen the countdown
      field's 15 s refresh, `PAST_TARGET_REFRESH_MS`).
- [x] 2.2.2 Cause (file:line, `HEAD`): `apps/runtime/src/renderer/ui/DateTimeInput.tsx:115`
      (`useCalendarChoice` — `useSyncExternalStore`) in the same component as the render-phase re-seed
      `:131-135` (`setSeen` / `setDrafts` during render). React 18 drops the store-instance update on the
      render-phase re-render, so its record of the calendar stays at the first value (Jalali): a switch
      back to Jalali compares equal and schedules nothing. `calendar.ts` was not the cause — every
      conversion is O(1) (`isJalaliLeapYear`'s two `jalaliToGregorian` calls included).
- [x] 2.2.3 Fix: `useMaskedDateTime` sets no state during render — a draft remembers the value and
      reading it was made against, and a stale draft is DERIVED from the stored value at render.
- [x] 2.2.4 Tests — RED before: `dateTimeInput.dom.test.ts` › 2.2 (Gregorian → Lunar → Jalali →
      Gregorian → Jalali, each pressed at once) — red on `HEAD`'s control and on the first
      render-phase hook (`expected 'lunar-hijri' to be 'solar-hijri'`), green after; `@cg/gesture`
      `useMaskedDateTime.test.ts` › 2.2 (the hook beside a `useSyncExternalStore` read); e2e
      `countdown-target.spec.ts` › 2.2 (real clicks, press → shown: 2–4 ms in three runs); the bound the
      prompt asked for, `date-time-mask.test.ts` › 2.2 (`pickerMonth`: one conversion and one month length
      per month, every calendar) — green on `HEAD`'s arithmetic too, kept as a guard.
- [x] 2.1.1 `@cg/text-shaping` `date-time-mask.ts`: slots, caret ↔ slot, `typeDigit` (overwrite; a part
      begun afresh at its start; `0` put in where a first digit can only be `0x`; refusals with reasons),
      `eraseAt`, `stepAtCaret`, `maskText` / `slotsOfText`, `separatorCaret`, `pickerMonth`.
- [x] 2.1.2 `@cg/gesture` `useMaskedDateTime`: keys, paste, the input's own change, caret, seeding,
      commit, the pickers' setters. Shared UI decision: `@cg/ui` is tokens-only (CLAUDE.md), so the shared
      parts are the rules and the behaviour; each app renders them with its own primitives.
- [x] 2.1.3 CG Control `DateTimeInput`: two `NumericInput`s, the calendar and clock icons in `Popover`
      (the time picker new), the refusal as a status line; `dateTimeInputModel` keeps the app's own rules
      (`monthGrid` now reads `pickerMonth`); `controls.css` (no new colour).
- [x] 2.1.4 Designer `DateTimeInput`: two inputs, the pickers in a new `ui/Popover` (the Designer had
      only feature-local popovers); `DateTimeInput.css.ts`.
- [x] 2.1.5 Superseded tests rewritten (six boxes → two inputs), subjects kept: CG Control
      `dateTimeInput.dom.test.ts`, `dateTimeInputModel.test.ts` (now over `masksOfValue` /
      `valueOfMasks`), `inspectorCountdownTarget.dom.test.ts`, e2e `countdown-target.spec.ts`; Designer
      `date-time-input.dom.test.ts`, `countdown-steps.dom.test.ts`, e2e `date-time-input.spec.ts`,
      `countdown-steps.spec.ts`. Swept by string (`data-datetime-segment`, the segment classes, the
      segment names `… hour` / `… minute`) and by component (every test mounting either control or a
      countdown target — 36 files; 4 touched the boxes).
- [x] 2.1.6 Measured in Chrome: both apps at 1280×720, at 200 % (CG Control: zoom; the Designer: text) and
      in RTL — neither input clips, both stay inside the Inspector, the date reads left to right; both
      pickers open inside the window, in both directions. The owner's check (`1405/13/40`, `25:61`, a
      calendar pick, a clock pick) in both apps.
- [x] 2.1.7 Found, not changed: CG Control's `Popover` closes on any scroll beneath it, including the one
      a click that scrolled its own button into view starts (the scroll event lands a frame after the
      panel opens). A person sees the field before pressing its icon; the e2e brings it into view first.
- [x] 2.1.8 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)

## 2.3 — `Solar Hijri` → `Jalali` (FULL lane: a label shared by both apps; its pins)

- [x] 2.3.1 Swept by string (`solar hijri`, any case, any separator — 2 + 1 source hits, 41 + 4 test hits,
      4 + 6 spec hits; per pathspec: `apps/runtime/src` 2, `apps/designer/src` 1, `packages` 36,
      `apps/runtime/tests` 41, `apps/designer/tests` 4, `openspec/specs` 4, `openspec/changes` 6, `tools` 0,
      `docs` 0 — the hyphen form `solar-hijri` is the stored id and stays) and by code (every reader of
      `CALENDAR_LABELS`: both apps' `DateTimeInput`, nothing else; the other `persian` hits are digit sets).
      The ONE user-visible source: `CALENDAR_LABELS['solar-hijri']` (`calendar.ts`).
- [x] 2.3.2 `CALENDAR_LABELS['solar-hijri'] = 'Jalali'`; the prose that names the calendar in both apps'
      control and `calendar.ts`. Station setup → Calendar names only the Lunar Hijri day (nothing to change).
- [x] 2.3.3 The one negative pin re-aimed: `dateTimeInput.dom.test.ts` `not.toContain('Solar Hijri')` would
      have passed vacuously after the rename — now `not.toContain('Jalali')`, with a positive `toContain`
      after the switch. Test titles and comments renamed.
- [x] 2.3.4 Tests — RED before the rename, green after: `calendar.test.ts` (the labels; the ids and the
      default unchanged); `dateTimeInput.dom.test.ts` (the buttons read `Jalali`, `Gregorian`, `Lunar Hijri`;
      the facts say `Jalali`); Designer `date-time-input.dom.test.ts` (the options, by value and label);
      e2e `countdown-target.spec.ts` and Designer `date-time-input.spec.ts` (the same, in Chrome).
- [x] 2.3.5 Linux `e2e` discharged on the pushed commit — run URL: https://github.com/yasermostafaee/cg/actions/runs/39698919913 — `7eec321b` (carries every commit of this run), completed `success`, its E2E job RAN (Designer 343 passed, CG Control 367 passed)
