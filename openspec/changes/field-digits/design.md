# Design — field-digits (`FIELD-DIGITS-01`)

## §0 Established first (2026-09-27)

### §0.1 The cause, measured on this machine

Installed input methods (`Get-WinUserLanguageList`): `0409:00000409` (US) and `0429:00000429` (**Persian**, the
older layout); `HKCU\Keyboard Layout\Preload` = `00000409`, `00000429`. A throwaway PowerShell probe (deleted
afterwards) called `ToUnicodeEx` with each layout's HKL and the "do not change keyboard state" flag, NumLock on.
`Persian (Standard)` (`00050429`) is not installed: it was loaded with `KLF_NOTELLSHELL` for the reading and
unloaded; the `Preload` key was unchanged.

| layout                                           | top row `VK_0…VK_9`       | numpad `VK_NUMPAD0…9` (NumLock on) |
| ------------------------------------------------ | ------------------------- | ---------------------------------- |
| US `00000409`                                    | U+0030–U+0039 (Latin)     | U+0030–U+0039 (Latin)              |
| **Persian `00000429`** (installed — the owner's) | **U+0030–U+0039 (Latin)** | **U+0030–U+0039 (Latin)**          |
| Persian (Standard) `00050429` (not installed)    | U+06F0–U+06F9 (Persian)   | **U+0030–U+0039 (Latin)**          |

**The cause, in one line:** the owner's Persian layout types Latin digits on the top row and on the numpad, and
even Persian (Standard) types Latin on the numpad — the keyboard never hands the page a Persian digit, so a
setting on the FIELD, not the keyboard, has to decide.

**No CG Control code path turns Persian digits into Latin** (`template-value-digits` has no bug to fix here):
the Inspector's text field (`Inspector.tsx` `FieldControl`, default branch) and a `Time`-pattern field (the same
text input — the pattern is the Designer's check) stage `e.target.value` verbatim; the number field renders
`NumericInput digits="as-typed"`, which hands the text over unchanged; a list cell stages `e.target.value`
verbatim (`ListFieldEditor.tsx` 208). The Tauri build hosts the same renderer bundle in WebView2, and its Rust
side (`apps/runtime/src-tauri/src/main.rs`, `sidecar.rs`) handles no field text at all. ⚠ Established from the
code for the Tauri build, not measured in the installed app: starting it would dial its configured Playout, which
this run may not reach.

### §0.2 Where the digits transform lives, and where a binding draws its value

- `persian-digits` / `latin-digits` are BINDING transforms (`@cg/shared-schema` `bindings.ts` 10–11), applied by
  `@cg/template-runtime` `transforms.ts` 21/23 with `@cg/text-shaping`'s `persianDigits` / `latinDigits`.
- A binding's value is written by `bindings.ts` `applyOne`: the `text` target (`stringifyValue` → the binding's
  transform → the field's `maxLength` → the glyph node) and the `lottie-override` text prop (the same pipeline); a
  `sequence-item-text` value reaches its item through the sequence driver's `textValueFor` seam (`runtime.ts`).
  A `number` field's JSON number is written by `stringifyValue` → `String(n)`: Latin. Every walk has the doc's
  field definitions in hand (`applyFieldValues` / `applyDocScope` build `maxLength` from them).

### §0.3 The clock's digits choice

Stored on the clock element as `digits: 'latin' | 'persian' | 'arabic-indic'` (`elements.ts` 494, default
`persian`); edited by a `SelectField` labelled `digits` whose options are the raw values `persian`, `latin`,
`arabic-indic` (`StyleSection.tsx` 2371–2376). The field setting reuses that control and those words, with
`as-typed` added for a text field.

### §0.4 An old document

A field carrying no `digits` parses unchanged (`z.optional()`), and reads as `as-typed` for a text field and
`latin` for a number field — exactly what air shows today (a text value verbatim; a number through `String(n)`).
No migration writes the key; only the author's choice in the Designer does.

## §1 What is built

- `@cg/text-shaping` `writeFieldDigits(value, digits, kind)` — THE one function. `as-typed` is the identity.
  Otherwise every `0-9`, `۰-۹` and `٠-٩` is written in the chosen set, one code unit for one; in a `number` the
  decimal mark is written `٫` (Persian, Arabic-Indic) or `.` (Latin). Punctuation in text is untouched, no
  grouping is added, and the function is idempotent — so a value from any source (the Inspector, a GDD client,
  retention) draws the same.
- `@cg/shared-schema`: `digits` on `text` / `multiline` (`as-typed` · `persian` · `latin` · `arabic-indic`) and on
  `number` (`persian` · `latin` · `arabic-indic`); `fieldDigitsOf(field)` — the effective choice (absent: text
  `as-typed`, number `latin`; no schema: `as-typed`). Golden rule 6: the page, the Inspector and the Designer all
  read the choice through it.
- The page: `applyOne` writes a `text` and a `lottie-override` text value through `writeFieldDigits` with its
  field's choice, BEFORE the binding's own transform (an explicit per-binding `latin-digits` still wins); the
  sequence driver's `textValueFor` seam does the same.
- CG Control's Inspector: the text and multiline inputs write the choice into the DOM input on every change and
  put the caret back (`ui/fieldDigitsInput.ts` — the mapping is one for one, so the indices hold), and show the
  value in the choice whatever wrote it (a push, a file source, a retained value); the number field's
  `NumericInput` takes the field's choice as its `digits` mode — `as-typed` (no schema), `latin` (the console path
  it already had, with the decimal mark), `persian` / `arabic-indic` (the new branch, the same caret rule, and a
  scrub written in the same set). The reader, the refusal line and the staging are `PERSIAN-DIGITS-01`'s.
- The Designer: a `digits` `SelectField` in the field's meta (text: four choices; number: three — the schema's own
  option lists, not a local copy), carried by `rebuildField` across text ↔ multiline, dropped to absent (Latin)
  when a text field set to `as-typed` becomes a number, and kept when it is a digit set; a field made through a
  text element's Data key starts on `persian`. The canvas and the preview ARE the page (the `cgpreview` iframes
  run `@cg/template-runtime`), so both draw the choice with no code of their own.

## Choices made (the smaller and safer option each time)

1. **"Text field" includes `multiline`.** Both are the author's text; the owner's rule is that no keyboard
   setting may matter, and a multiline field typed on the same keyboard has the same problem. List fields are not
   given the setting (not named by the owner).
2. **An absent `number` means `latin` in the Inspector's box too**, not only on air: "what the operator sees is
   what goes on air", and air draws an absent number in Latin. This supersedes `PERSIAN-DIGITS-01`'s as-typed
   DISPLAY for a number field that carries no choice; its reader, refusal line and staging are unchanged, and a
   number field set to `persian` keeps `۱۲٫۵` on screen exactly as before.
3. **With no resolved schema the Inspector transforms nothing** (`as-typed`): not knowing the author's choice is
   not a choice.
4. **The field's digits apply before the binding's transform**, so an explicit `latin-digits` binding on one
   element still draws Latin.
5. **The Designer's own value boxes are unchanged**: the field's Value and the preview form's inputs keep what
   the author typed (`PERSIAN-DIGITS-01`), and the canvas and the preview — the page — draw the choice. The prompt
   asks the preview to draw what air draws; rewriting the author's inputs as well was not asked.
6. **A sequence item's field (`D-083`) is made WITHOUT a `digits` value**, so it draws as typed, exactly as
   before. The Designer has no meta surface for that field — no title, required or pattern either — so a Persian
   start there would be a setting nobody could change. The schema and the page already honour the key on it;
   giving it a control is its own item (open decision in the report).
7. **The GDD is unchanged.** It describes the value's TYPE for a GDD client (a string, a number); the digits are
   the page's to draw, and the one writer is idempotent, so whatever a client sends draws in the field's set.
