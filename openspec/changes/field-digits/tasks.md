# Tasks — field-digits (`FIELD-DIGITS-01` v1)

Lane: FULL (a schema field, and what goes on air).

## §0 Establish

- [x] 0.1 The cause measured on this machine: layouts installed and what each types (`design.md` §0.1); no CG
      Control code path converts digits.
- [x] 0.2 Where the digits transform lives; where a text and a number binding draw their value.
- [x] 0.3 How a clock's digits choice is stored and edited.
- [x] 0.4 How an old document with no Digits value loads.

## §1 Build

- [x] 1.1 `@cg/text-shaping` `writeFieldDigits` (`field-digits.ts`).
- [x] 1.2 `@cg/shared-schema`: `digits` on text, multiline and number fields; `fieldDigitsOf`.
- [x] 1.3 `@cg/template-runtime`: the page writes a bound value in its field's digits — the `text` target, a
      `lottie-override` text layer and a bound sequence item (`fieldValueText`); README updated.
- [x] 1.4 CG Control: the Inspector writes digits as they are typed (text, multiline, number), caret kept
      (`ui/fieldDigitsInput.ts`, `NumericInput` `digits`).
- [x] 1.5 The Designer: the `digits` setting; a Data-key field starts on `persian`; the canvas and preview are the
      page. A sequence item's field is left without a value (`design.md` choice 6).
- [x] 1.6 `template-value-digits`' pending requirements amended in place.

## §2 Tests

- [x] 2.1 Unit: each choice on `12.5`, `-3`, `1234567`, `ساعت 12:30`, `F-16`; idempotent; `as-typed` identity
      (`text-shaping/tests/field-digits.test.ts`); the schema and `fieldDigitsOf` (`shared-schema/tests/fields.test.ts`);
      the page (`template-runtime` `bindings`, `sequence-runtime`, `lottie-runtime` tests). Red on `HEAD`: 5 of the page's.
- [x] 2.2 Real key events (`key: '1'` with `Numpad1` and `Digit1`) into a Persian Inspector field; control
      `as-typed` (`apps/runtime/tests/e2e/persian-digits.spec.ts`); dom: box, staging, caret, multiline, number
      (`numericInput.dom.test.ts` — 7 red on `HEAD`; the caret assertion proven live by removing the restore).
      The numpad key is dispatched through CDP with NumLock ON: Playwright's `Numpad1` models NumLock OFF and
      sends `End`.
- [x] 2.3 CG Control e2e on the fake: Persian text, Persian number, Latin control, and the page handed the bytes
      CasparCG received (`persian-digits.spec.ts`).
- [x] 2.4 Designer dom: new text and number fields show `persian`; an old document shows `as-typed` / `latin`; the
      preview follows (`apps/designer/tests/field-digits.test.ts` — 6 of 7 red on `HEAD`).
- [x] 2.5 Exported page: a Persian number's digits in one face; an old template renders unchanged
      (`apps/designer/tests/e2e/field-digits.spec.ts`).

## §3 Gate and discharge

- [x] Z.1 `pnpm gate`; `pnpm openspec validate --all --strict` — the pre-push gate at `191fafee` and at `8e212ff8`:
      96/96 tasks, OpenSpec 89/89.
- [x] Z.2 CI: `e2e` and installer runs COMPLETED and GREEN, jobs confirmed RAN — at `8e212ff8` (carries `191fafee`):
  - PR https://github.com/yasermostafaee/cg/actions/runs/36314209497 — success; `E2E (Playwright)` RAN, its `E2E`
    step success (Designer 288 passed, CG Control 284 passed).
  - Desktop https://github.com/yasermostafaee/cg/actions/runs/36314209533 — success; `Installers (Windows)` and
    `Installer smoke (clean Windows)` RAN.
  - The first run, at `191fafee` (https://github.com/yasermostafaee/cg/actions/runs/36312662838), was red on ONE
    Designer spec, `critical-flow.spec.ts`: its new field now starts on Persian, so `Hello E2E` draws as
    `Hello E۲E` — the decided behaviour; the spec was re-expressed at `8e212ff8`. That run's Desktop run
    (https://github.com/yasermostafaee/cg/actions/runs/36312662855) was green.
