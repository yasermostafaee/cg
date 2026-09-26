# Tasks — template-value-digits

## 0. Establish (§0)

- [x] 0.1 PRD items found and built on: [[R-020]] (`[x]`, Runtime numeric input — normalise and
      display Latin), [[D-130]] (`[ ]`, the Designer half), [[R-014]] (`[ ]`, numerals DISPLAYED in
      Persian in the operator UI — not this change). No new item minted.
- [x] 0.2 Today's behaviour measured in Chromium, both apps, the wire and the on-air page —
      `design.md` §0.
- [x] 0.3 Computed numbers reported, with a proposal — `design.md` §0.3.

## 1. The one reader — `@cg/text-shaping`

- [ ] 1.1 `numerals.ts`: `readLocalizedNumber` (number / incomplete / invalid),
      `parseLocalizedNumber`, `parseTimeOfDay`, `parseDurationMs`, `latinNumerals`, `digitSetOf`,
      `formatNumberLike`; exported from the index.
- [ ] 1.2 Tests — `۱۲٫۵` / `١٢٫٥` / `12.5` → 12.5; `۱٬۲۳۴` → 1234; `۰۰:۳۰` → 30 s; `۲۰:۳۲` →
      `20:32`; the controls: `۱۲a` invalid, `۲۵:۳۲` not a time, a Latin value unchanged.

## 2. On air — `@cg/template-runtime`

- [ ] 2.1 `clock-driver.ts`: `parseTimeOfDay` from the shared reader (re-exported); `resolveTimeOfDay`
      reads through it; the local regex goes.
- [ ] 2.2 `bindings.ts`: a `transform` target falls back to the shared reader when `Number()` is
      not finite.
- [ ] 2.3 Tests — a live countdown re-targets from `۲۰:۳۲`; red first against the ASCII regex.

## 3. CG Control

- [ ] 3.1 `NumericInput`: an as-typed mode (`digits="as-typed"`) — no normalisation, the scrub
      reads through the shared reader and writes back in the typed digit set.
- [ ] 3.2 `draftStore.unstageField`.
- [ ] 3.3 Inspector `NumberField`: as-typed display, the shared reader, the one-line refusal and
      `aria-invalid` for an impossible entry, the draft withdrawn for any entry that is not a number.
- [ ] 3.4 Dom tests — `۱۲۸` shows `۱۲۸` and stages 128; `۱۲a` refuses in one line and stages
      nothing; `۱٬` says nothing. `numericInput.dom.test.ts` "a NUMBER field typed in Persian"
      re-expressed (it pinned the superseded Latin display).

## 4. Designer

- [ ] 4.1 `ui/LocalizedNumberInput.tsx` — the as-typed number primitive.
- [ ] 4.2 The number field's default ("Value"), the preview form's number field, the repeater
      number columns and the per-item dwell use it.
- [ ] 4.3 `validateField` reads a pattern through `latinNumerals`.
- [ ] 4.4 `rebuildField` reads a text default through the shared reader when a field becomes a
      number (`۱۲` → 12, not 0).
- [ ] 4.5 Tests — dom/unit for each, red first.

## 5. E2E (§2)

- [ ] 5.1 CG Control, real bridge + `@cg/amcp-mock`: `۱۲۳` / `١٢٣` / `123` arrive in `CG UPDATE`
      exactly as typed; `۱۲٫۵` stays on screen and goes as 12.5; `۱۲a` refused in one line;
      `ساعت ۱۲:۳۰` reads in order in the Inspector field.
- [ ] 5.2 Designer: number default and preview keep Persian digits; the Time preset accepts
      `۲۱:۳۰`; the exported on-air page draws `۱۲۳۴۵۶۷۸۹۰` with one face (CDP) and `ساعت ۱۲:۳۰` in
      order, each with its Latin control.

## 6. Spec and records

- [x] 6.1 NEW capability `template-value-digits`; MODIFIED `runtime-ui` (the R-020 requirement);
      the pending `add-azan-countdown` delta and design amended in place.
- [ ] 6.2 `pnpm openspec validate --all --strict`.
- [ ] 6.3 PRD: R-020 and D-130 notes; D-130 stays queued for the Designer's chrome numbers.

## 7. Gate and discharge

- [ ] 7.1 `pnpm gate` green.
- [ ] 7.2 Linux `e2e` on GitHub Actions for the commit carrying the change — run URL here, with the
      job confirmed RAN.
- [ ] 7.3 Installer (`desktop.yml`) run URL here, with the job confirmed RAN.
