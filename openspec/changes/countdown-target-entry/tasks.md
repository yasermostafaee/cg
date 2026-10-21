# Tasks — countdown-target-entry (RUN-NEXT-VERSION-03 Part 2)

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
- [ ] 2.3.5 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_
