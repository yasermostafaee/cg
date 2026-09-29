# Design — text-digits (`TEXT-DIGITS-01` v2)

## §0 Established first (2026-09-27)

### §0.1 Every place digits are typed or drawn

| site                                                                                                                     | where the text is stored                                                                | where the page draws it                                           | digits before this change                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Designer — double-click edit on the canvas (`TextEditor.tsx`, a `contentEditable` div in the app DOM, not in the iframe) | `element.text`; for a bound element also its field's `default` (`setElementText`)       | `scene-builder.ts` `buildText` → `renderTextGlyphs`               | none — shows `element.text` raw                                        |
| Designer — the Inspector's text boxes                                                                                    | a text element has NONE for its content; with a Data key the field's Value box edits it | —                                                                 | —                                                                      |
| Designer — a field's Value box (`DynamicDataSection.tsx` → `TextField`; number → `NumberField`/`RealtimeNumberInput`)    | the field's `default` (+ `element.text` for a text element)                             | as the bound value                                                | text verbatim; number as typed (`as-typed` display)                    |
| Designer — the preview form (`PreviewFieldForm.tsx`: `GrowTextarea`, `PreviewNumberInput`, `ListItemsEditor`)            | pending values, sent by `update`                                                        | the preview iframe is the page                                    | verbatim                                                               |
| Designer — list items (`ListItemsEditor.tsx`: ticker items, sequence items, repeater cells)                              | `ticker.items`, `sequence.items`, `repeater.items`, or a list field's `default`         | ticker / sequence / repeater drivers                              | none on any list path; repeater cells use their child fields' `digits` |
| Designer — sequence items                                                                                                | `sequence.items[].text`; a bound item's per-item field                                  | `sequence-driver.ts` `renderItem`; bound items via `textValueFor` | authored verbatim; bound by the field                                  |
| Designer — Lottie text                                                                                                   | no editing surface (Bind-from-canvas only)                                              | `lottie-override` text prop                                       | bound value by its field                                               |
| Designer — ticker separator (`TickerSeparatorControl.tsx`)                                                               | `ticker.separator`                                                                      | ticker driver                                                     | verbatim                                                               |
| Clock / countdown (one element, `mode`)                                                                                  | `digits` (`elements.ts` 494, `.default('persian')`)                                     | `clock-format.ts`, its own `mapDigits`                            | the clock's choice                                                     |
| **Date**                                                                                                                 | **no element**: only the `date-fa` / `date-en` binding transform (`bindings.ts` 12–13)  | `transforms.ts` → `dateFa` (always Persian) / `dateEn` (Latin)    | fixed by the transform                                                 |
| CG Control — Inspector text / multiline (`Inspector.tsx` `FieldControl`)                                                 | staged field value                                                                      | the bound value                                                   | the field's choice (`FIELD-DIGITS-01`), `as-typed` = verbatim          |
| CG Control — number (`NumberField` → `NumericInput`)                                                                     | staged NUMBER                                                                           | `String(n)` in the field's digits                                 | the field's choice                                                     |
| CG Control — list cells (`ListFieldEditor.tsx`)                                                                          | staged list value                                                                       | ticker / sequence items                                           | none (verbatim)                                                        |
| CG Control — sequence items                                                                                              | a bound text item is a text field in `FieldControl`                                     | `textValueFor`                                                    | the field's choice                                                     |

### §0.2 Mixing typed text and a bound value

The page CAN mix them in one element: a `text` binding with a `placeholder` writes the author's `original` with
the marker replaced (`bindings.ts` 176–187); without one the value replaces the whole text. The Designer never
creates a placeholder binding (Data key and Bind-from-canvas both bind the whole text; starters are pinned to
have none), so a Designer-authored text element is all typed or all bound — and for a bound one the text the
author types IS the field's `default`, drawn by the field's rule. Other real mixes: a sequence's authored items
beside its bound ones; a ticker's authored separator beside bound list items; a clock's format literals beside its
computed digits.

### §0.3 Knowing the keyboard language — measured on this machine

Installed input methods: US `00000409`, Persian `00000429`. The workstation was LOCKED (LogonUI running), so no
OS keystroke could be sent; every switch was made by posting `WM_INPUTLANGCHANGEREQUEST` to a test window only
(the one exception the prompt allows), each thread restored to the layout it had (Persian). The owner's own
foreground window read Persian before, during and after, untouched. The probes were deleted.

| candidate                                                                                           | browser dev path (system Chrome 153, headed, `http://127.0.0.1`)                                                                                                                                                                                                                              | installed CG Designer (WebView2 153, over CDP)                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `navigator.keyboard.getLayoutMap()`                                                                 | **blind**: `KeyQ` → `q` with the Chrome thread on Persian and on US alike                                                                                                                                                                                                                     | **blind**: `KeyQ` → `q` in every state                                                                                 |
| `GetKeyboardLayout` of the webview's INPUT thread (the thread owning `Chrome_RenderWidgetHostHWND`) | n/a (no shell)                                                                                                                                                                                                                                                                                | **follows every switch**: US → `0x04090409`, Persian → `0x04290429`, on the first read after the switch                |
| `GetKeyboardLayout` of the APP's own thread (the top-level `Tauri Window`)                          | n/a                                                                                                                                                                                                                                                                                           | **misses it**: stayed Persian while the webview's thread was switched to US — a naive `GetKeyboardLayout(0)` would lie |
| the script of the last letter typed                                                                 | works as typed; measured which letters each layout types (`ToUnicodeEx`, every key, with and without Shift; the unloaded layouts loaded without activation and unloaded): only پ چ ژ ک گ ی ۀ prove Persian, only ى proves Arabic (the Persian layouts type ة and ي, and Persian (Standard) ك) | same                                                                                                                   |

The Keyboard Map API is blind by design: it reports the ASCII-capable layout the OS uses for shortcuts.

**Choice (a fallback chain, one module):** the desktop shell's ONE read-only command `keyboard_language`
(`GetKeyboardLayout` of the thread that owns the webview's input window; Persian `0x29` → `persian`, Arabic `0x01` →
`arabic`, English `0x09` → `latin`, anything else → `unknown`), asked on every key and polled every 250 ms while a
text box has focus → the letters typed since the last switch shortcut (Alt+Shift, Ctrl+Shift) → `unknown`. The
browser has no shell, so it reads the letters. ⚠ The command itself could not be compiled or run here (no Rust on
this machine): what was measured is the Win32 read it makes, in the installed app; the command is proven by the
installer smoke on CI.

CG Control was not launched: its sidecar would read `~/.cg-runtime`, which names `192.168.21.114`. It hosts the
same WebView2 runtime as CG Designer.

### §0.4 The clock and the date

The clock stores `digits` (`latin` / `persian` / `arabic-indic`, `.default('persian')`) and maps its formatted
text LAST with its own `mapDigits` — a second mapper, replaced here by `writeFieldDigits`. There is no date element
and no clock date token: the Jalali date is the `date-fa` binding transform, whose `dateFa` always writes Persian.
⚠ Latent defect: the page writes a field's digits BEFORE the transform, so a field set to `persian` hands `dateFa`
`۲۰۲۶-۰۵-۱۹`, which `new Date()` cannot read — it throws, and nothing in the apply walk catches it.

### §0.5 An old document

A field's `digits` is `.optional()` and adds nothing on parse; the clock's is `.default('persian')` and does (it is
pinned). Every new `digits` here is `.optional()`, so an old document reads Keyboard (the identity on the page) and
gains no key. No normalisation step touches `digits`; defaults are written only when something is created.

## §1 What is built

- `@cg/text-shaping`: `KeyboardLanguage`, `keyboardDigits` (Persian → Persian, Arabic → Arabic-Indic, English →
  Latin, unknown → none), `languageOfLetter` / `followLetter` (the measured letter sets), and `writeEnteredDigits`
  — what an editor writes when text is entered: a digit set writes the whole value (a paste included); Keyboard
  writes only TYPED text, in the keyboard's digits; every digit through `writeFieldDigits`, one character for one.
  A date is read in any digit set before it is converted.
- `@cg/gesture`: `createKeyboardLanguage` — THE detector; each app makes one at start and every editor asks it.
- The shells: `keyboard_language` (one Rust file, `apps/designer/src-tauri/src/keyboard_language.rs`, included by
  CG Control with `#[path]`); CG Control grants it only to the console page (`allow-keyboard-language`).
- `@cg/shared-schema`: an optional `digits` on the text, ticker and sequence elements (the text their author
  typed) and on a `list` field; `elementDigitsOf`; `fieldDigitsOf` reads a list field.
- The page: a text element's typed text in the element's choice (a placeholder binding's author text too); a
  ticker's authored items and separator and a sequence's authored items in the element's; a list field's items in
  the list's; a date binding's OUTPUT in its field's choice (absent: the transform's own digits), its input read in
  any set; the clock through `writeFieldDigits`.
- The Designer: one `DigitsField` (the clock's control, the words Keyboard · Persian · Latin · Arabic-Indic) on
  the clock, the text / ticker / sequence elements, every field's meta (list included) and a bound sequence item;
  new elements and fields start on Persian; every editing surface writes the choice as typed.
- CG Control: the Inspector's text fields gain Keyboard mode; list cells write their list's choice as typed.

## Choices made (the smaller and safer option each time)

1. **The date's choice is its FIELD's**, not a new key: a date binding's output is written in the bound field's
   digits, and absent (Keyboard) keeps the transform's own (Persian for `date-fa`, today's behaviour). There is no
   date element and the Designer has no binding-transform surface, so a separate date control would need a new
   panel; the field's control already exists. This also removes the latent `date-fa` crash.
2. **A bound text element shows the FIELD's control, not its own**: its text is the field's value (§0.2), so one
   control per element or field means the element's own Digits appears only while it has no Data key.
3. **Ticker and sequence elements get the element choice** for the text typed INTO them (authored items, the
   separator); a list bound to them draws in the list field's choice.
4. **The label stays `digits`** (the Inspector's labels are lower-case and tests address it by name); the option
   WORDS are the owner's.
5. **The measured letter sets, not the Unicode blocks**, decide what a letter proves.
6. **A box opened and left with no edit writes nothing** — the canvas's double-click edit and a Designer text box
   that shows a Digits choice — even when the stored text's digits differ from the choice it is shown in. A
   Latin-stored default in a Persian field would otherwise be rewritten, with an undo entry and a dirty document,
   by a mere focus and blur; the page draws it the same either way.
7. **No resolved schema writes nothing** in CG Control (`FIELD-DIGITS-01`'s rule), Keyboard included: not knowing
   the author's choice is not a choice.
8. **A repeater's number columns are unchanged**: they are numbers, read by the one reader, and drawn by their child
   field's own setting.
9. **Lottie text keeps its bound value's rule and gains no surface**: the Designer has no editor for a Lottie text
   layer (Bind-from-canvas only), so there is no typed text of the element's to draw.
10. **The clock and the `persian-digits` / `latin-digits` transforms go through the one writer**
    (`writeFieldDigits`): three mappers were one mapper's job.
11. **A bound sequence item's field gets its Digits beside its data key** (`ListItemsEditor`, one `Select` per bound
    item, the owner's words): the smallest place for one control per field; no new panel.
12. **One Rust file for both shells** (`#[path]` from CG Control), so the command cannot come to read a different
    thread in one app than the other.
13. **The detector lives in `@cg/gesture`**: interaction behaviour with neither styling nor markup, shared by both
    apps — that package's stated purpose — and `@cg/gesture` now depends on `@cg/text-shaping` for the language
    names.

## The owner's decisions on the open questions (2026-09-28, `FOLLOWUPS-01` D — recorded, no code change)

- **A date draws in its field's choice, and gets no control of its own** — choice 1 above stands as the decision.
- **The Keyboard poll stays**: every 250 ms while a text box has focus (§0.3), beside the per-key ask.
