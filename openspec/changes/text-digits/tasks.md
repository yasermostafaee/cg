# Tasks — text-digits (`TEXT-DIGITS-01` v2)

## 0. Establish first

- [x] 0.1 Every place digits are typed or drawn (`design.md` §0.1)
- [x] 0.2 Mixing typed text and a bound value (§0.2)
- [x] 0.3 Knowing the keyboard language — measured in Chrome and in the installed CG Designer (WebView2) (§0.3)
- [x] 0.4 The clock's digits and the date's (§0.4)
- [x] 0.5 An old document (§0.5)

## 1. The one writer, the one detector, the one command

- [x] 1.1 `@cg/text-shaping`: `KeyboardLanguage`, `keyboardDigits`, `languageOfLetter` / `followLetter` (the measured
      letter sets), `writeEnteredDigits` — unit tests with controls
- [x] 1.2 `@cg/gesture`: `createKeyboardLanguage`, the pinned fallback order — tests from fake sources; each of five
      planted defects (letters over the shell, a failed shell asked again, a switch chord that forgets nothing, a
      Ctrl+letter counted as typing, a stale reply) turns exactly its own test red
- [x] 1.3 The shells: `keyboard_language` (one Rust file, both shells), CG Control's permission for the console only;
      `Cargo.lock`
- [x] 1.4 A date is read in any digit set before it is converted

## 2. Schema

- [x] 2.1 `digits` (optional) on the text, ticker and sequence elements and on a `list` field; `elementDigitsOf`;
      `fieldDigitsOf` reads a list field — an old document parses with no key added

## 3. The page

- [x] 3.1 A text element's typed text in the element's choice; a placeholder binding's author text too
- [x] 3.2 A ticker's authored items and separator, a sequence's authored text items, in the element's choice
- [x] 3.3 A list field's items (ticker, sequence) in the list's choice
- [x] 3.4 A date binding: its input read in any set, its output in its field's choice (absent: the transform's own)
- [x] 3.5 The clock through `writeFieldDigits`

## 4. The Designer

- [x] 4.1 One `DigitsField` — the clock's control, the words Keyboard · Persian · Latin · Arabic-Indic — on the clock,
      the text / ticker / sequence elements, every field's meta (list included) and a bound sequence item
- [x] 4.2 New elements (text, ticker, sequence) and new fields (Data key, list, sequence item) start on Persian
- [x] 4.3 The detector, made once at start, with the shell's command through the bridge
- [x] 4.4 Every editing surface writes the choice as typed, caret kept: the double-click edit, a field's Value box
      (text and number), the preview form, list and sequence items, the ticker's separator; a box focused and left
      with no edit writes nothing (as the double-click edit)

## 5. CG Control

- [x] 5.1 The detector, made once at start, with the shell's command through the bridge
- [x] 5.2 The Inspector's text fields: Keyboard mode (typed digits in the keyboard's, a paste kept)
- [x] 5.3 List cells write their list field's choice as typed

## 6. Tests (each with its control)

- [x] 6.1 Unit: every choice on a static text, a list value, a sequence item and a date; the page's parts — four
      planted page defects turn every non-control case red and leave the controls green
- [x] 6.2 Designer dom: new text / list / sequence-item field / element read Persian; an old document reads Keyboard
      with no key; the double-click edit shows `۱۴` for `14` with the caret kept (control: Latin); the Value box and
      the preview form follow the field — ten planted Designer defects each turn their own cases red
- [x] 6.3 Designer e2e with real key events: `اخبار ساعت 14` → `اخبار ساعت ۱۴`, exported, one face (control: Latin);
      Keyboard mode `12` then `34` → `12۳۴`; a mixed element (on the exported page, in the CG Control spec) — run
      locally green on Windows (non-authoritative; the discharge is 7.2)
- [x] 6.4 CG Control e2e on the fake: a Persian list cell `12` → `۱۲` on screen and in the `CG UPDATE`; a Keyboard
      field follows the signal — run locally green on Windows (non-authoritative; the discharge is 7.2)
- [x] 6.5 Old template draws exactly as before
- [x] 6.6 Tests that pinned the superseded behaviour re-expressed (raw option words, verbatim Designer inputs, the
      exported `digits` count)
- [x] 6.7 The installer smoke asks both installed apps for `keyboard_language` (proven by 7.3)

## 7. Gate and CI

- [ ] 7.1 Prettier; `pnpm gate`; `pnpm openspec validate --all --strict`
- [ ] 7.2 Linux `e2e` COMPLETED and GREEN with its E2E step run — URL
- [ ] 7.3 Installers COMPLETED and GREEN, both jobs run — URL
