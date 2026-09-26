# Design — template-value-digits

## §0 — Today, measured (2026-09-27, `dev` at `9116c89d`, before any change)

Measured in Chromium through throwaway Playwright specs against the built apps: the Designer
driven through its own UI, its single-file on-air page exported through `Export HTML` and driven
through the `update()` / `play()` globals CasparCG calls, and CG Control booted against a real
in-process bridge and the `@cg/amcp-mock` fake CasparCG (the bytes read back with
`mock.lastCgUpdate`). Fonts by CDP `CSS.getPlatformFontsForNode` — the face the engine DREW with.

| Surface                                     | `۱۲۳` / `١٢٣` typed                         | Stored / on the wire      | Renders on air                            |
| ------------------------------------------- | ------------------------------------------- | ------------------------- | ----------------------------------------- |
| Designer — text field default ("Value")     | kept as typed                               | as typed                  | as typed (canvas)                         |
| Designer — preview form, text field         | kept as typed                               | as typed                  | as typed                                  |
| Designer — `Time (HH:MM)` preset, `۲۱:۳۰`   | **refused** — `Doesn't match …`             | —                         | —                                         |
| Designer — number field default ("Value")   | **lost** — the native number box goes empty | **`0`**                   | `0`                                       |
| Designer — preview form, number, `۱۲٫۵`     | **lost** — box shows `0`                    | **`0`**                   | `0`                                       |
| CG Control — Inspector text field           | kept as typed                               | `CG UPDATE` data as typed | (page: as typed, see below)               |
| CG Control — Inspector number, `۱۲٫۵`       | **rewritten** to `12.5`                     | `12.5` (a JSON number)    | `12.5` (Latin — `String(n)`)              |
| CG Control — Inspector number, `۱٬۲۳۴`      | shown `1٬234`                               | **`1`** — a wrong number  | `1`                                       |
| CG Control — Inspector number, `۱۲a`        | shown `12a`, no message                     | **`12`** — a stale prefix | `12`                                      |
| CG Control — text field `۲۰:۳۲` (azan time) | kept as typed                               | as typed                  | **refused** by `parseTimeOfDay` (ASCII)   |
| On-air page — text `۱۲۳۴۵۶۷۸۹۰`             | —                                           | —                         | as typed, one face (Vazirmatn ×10 glyphs) |
| On-air page — `ساعت ۱۲:۳۰`                  | —                                           | —                         | in order: `۱۲:۳۰` left of `ساعت`          |

### Glyphs (§1 C), per template face, on this Windows host

| Template face                  | `۱۲۳۴۵۶۷۸۹۰`  | `۱۲:۳۰`                                   | `۱۲٫۵` / `۱٬۲۳۴` |
| ------------------------------ | ------------- | ----------------------------------------- | ---------------- |
| `Inter` (default; not bundled) | Vazirmatn ×10 | Vazirmatn (whole run)                     | Vazirmatn        |
| `Arial`                        | Arial ×10     | Arial ×5                                  | Arial            |
| `Tahoma`                       | Tahoma ×10    | Tahoma ×5                                 | Tahoma           |
| `Georgia` (no Persian digits)  | Vazirmatn ×10 | **digits Vazirmatn ×4, colon Georgia ×1** | Vazirmatn        |

No face ever drew a box. **The fallback is Vazirmatn**, which every element's stack names second
(`scene-builder.ts` — `${family}, Vazirmatn, "Noto Sans Arabic", …`) and which the single-file
export inlines, so it is present on a CasparCG host with no network. All the DIGITS of one number
always come from one face. The one seam: in a face with Latin glyphs but no Persian digits (Georgia,
Verdana), the ASCII colon of `۱۲:۳۰` is drawn by the template's face and the digits by Vazirmatn.
It reads correctly; the colon's shape is Georgia's. Closing it would need a per-character font
hack, which §1 D forbids in spirit; it is recorded, not built.

### Numbers the template computes itself (§0.3 — report only)

- **Clock (wall / countup / countdown)** — Persian digits by default: the schema default
  `digits: 'persian'` (`elements.ts`), the Designer's new-clock default, and measured on air: a
  90 s countdown on the exported page read `۰۰:۰۱:۲۹`. The author picks per clock
  (`latin` / `persian` / `arabic-indic`).
- **The azan countdown (`add-azan-countdown`)** — a countdown clock, so the same `digits` setting.
- **Jalali date** — only through the `date-fa` binding transform, always Persian digits.
- **A `number` FIELD bound to a text element** — `String(n)`, Latin. It is not computed by the
  template, but it is the one place a value the operator typed in Persian reaches air in Latin.
- There is no counter or scoreboard element.

**Proposal (owner decision — not built).** Computed numbers already follow the rule, through an
AUTHOR-owned per-element setting (golden rule 13's shape). Keep it. The open item is the NUMBER
FIELD: offer the author the same three-way `digits` choice on a number field's text binding —
the `persian-digits` binding transform already exists in the schema and in the runtime
(`transforms.ts`), it only lacks a Designer control. That puts a number field on air in Persian
without changing its wire type. The alternative — carrying the typed spelling on the wire — is a
schema change (`NumberField.default` is `z.number()`, the GDD says `number`) and is not
recommended.

## Decisions

### D1 — One reader, in `@cg/text-shaping`

`@cg/text-shaping` is pure, dependency-free and already a dependency of both apps and of
`@cg/template-runtime` (the on-air bundle), so the reader lives in `numerals.ts` there and every
surface imports it. No surface re-derives the digit ranges (golden rule 6).

`readLocalizedNumber(text)` returns one of three readings, because the UI must tell INCOMPLETE
from IMPOSSIBLE (the house rule from `MODAL-TRUTH-01`: refuse the impossible, never the
incomplete — a red sentence under the field for the whole of typing a correct value teaches the
operator to read past it):

- `number` — optional sign (`+`, `-`, U+2212), digits in any set with `٬` between groups, an
  optional fraction after `.` or `٫`; surrounding space and bidi marks (LRM, RLM, ALM — a paste
  from a Persian document carries them) are ignored.
- `incomplete` — empty, a lone sign, a lone decimal separator, or digits ending in `٬`: text that
  more typing can still complete.
- `invalid` — anything else (`۱۲a`, `1٬٬2`, `1.2.3`).

Latin `,` is NOT a thousands separator: in several locales it is the decimal mark, and `1,5`
silently read as fifteen is worse than a refusal.

### D2 — The wire keeps its types

A `number` field stages, stores and sends the parsed NUMBER. The typed text lives only in the
input. On an outside change (a push, Discard, undo, a scrub) the input re-renders the new number
in the digit set and decimal mark of the text it last showed (`formatNumberLike`), so a scrub on
`۱۲٫۵` shows `۱۳٫۵`, not `13.5`.

### D3 — An entry that is not a number stages NOTHING

The Runtime's field staged on every keystroke that parsed and ignored the rest, so the draft held
the last parsing PREFIX — `۱۲a` sent 12 and `۱٬۲۳۴` sent 1. Now any reading that is not a number
WITHDRAWS the field's draft (`unstageField`): Update then leaves that field exactly as it is on
air. An `invalid` reading also shows the refusal sentence and `aria-invalid`; an `incomplete` one
shows nothing. The Designer's inputs commit live, so the same rule is simply "commit nothing".

### D4 — Patterns read digits in any set

`validateField` accepts a value when the pattern matches it as typed OR matches
`latinNumerals(value)` (digits to Latin, `٫` to `.`, `٬` to `,`). The stored pattern strings are
NOT rewritten: templates already exported carry the old `Time (HH:MM)` regex, and a preset
rewrite would leave every one of them refusing Persian. Reading the value is the fix that reaches
existing templates.

### D5 — Time of day on air

`parseTimeOfDay` moves into `numerals.ts` and returns the CANONICAL Latin `HH:mm[:ss]` for a value
in any digit set; `clock-driver.ts` re-exports it and `resolveTimeOfDay` reads through it, so the
value the runtime accepts and the instant it resolves to still cannot disagree. The schema's
`timeofday` regex stays ASCII: it constrains the AUTHORED target, which the Designer writes in
canonical form.

### D6 — Duration

`parseDurationMs` reads `ss`, `m:ss` and `h:mm:ss` in any digit set (`۰۰:۳۰` = 30 000 ms), with a
bare number read as seconds. Its template-value consumer is the per-item dwell (a list item's
`dwellMs`), edited in seconds; a bare number keeps meaning exactly what it meant.

### D7 — `transform` bindings

A `transform` target (opacity / x / y / scale / rotation) read `Number(raw)`. It still does, and
falls back to the shared reader only when that is not finite, so every value that worked before
keeps its meaning (`1e3`, `0x10`) and a Persian-digit value stops being dropped.

## Out of scope — recorded

- A number field ON AIR in Persian digits (the proposal above).
- The colon seam in a Latin-only face (§ Glyphs).
- Operator-chrome numbers (R-020 / D-130's chrome half): unchanged by §1 E. D-130 stays queued
  for the Designer's CHROME numeric fields (position, size, …), where the owner has not asked for
  as-typed display.
- Timing overrides in CG Control's Timing section (passes, dwell): session settings on the row,
  not template values. They already accept Persian digits (R-020 normalisation).
