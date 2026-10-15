# designer-text-autosize — delta (Shrink to Fit, B-147 / TEXT-FIT-01)

## ADDED Requirements

### Requirement: Shrink to Fit SHALL shrink a fixed text until its laid-out, shaped run fits the box

A text element with `fitMode: 'shrink-to-fit'` SHALL keep its authored box and shrink its font size
(letter spacing with it) until the text as laid out — after shaping, so Persian joined forms, ZWNJ and
mixed scripts are measured as drawn — fits the box in both dimensions, measured from the rendered
layout and never from a character count, allowing one pixel for sub-pixel rounding. It SHALL NOT
shrink below half its authored size; past that minimum the author's overflow SHALL apply: clip, or a
one-line ellipsis. It SHALL re-fit in the same task as a field writes new text, so no frame shows the
text at the overflowing size, and again when the box first gets or changes its size and when a font
loads; a shorter value SHALL grow back toward the authored size. A text not set to fit SHALL render
exactly as before.

#### Scenario: A long Persian name fits its lower third

- **WHEN** a 900 × 90 box at 64 px receives `دکتر سید محمدعلی رضایی‌نژاد خراسانی اصفهانی`
- **THEN** the font shrinks (to about 47 px on CasparCG 2.5.0) and the laid-out name fits the box

#### Scenario: A short value fits back

- **WHEN** the same field is then updated to `سارا نادری`
- **THEN** the font grows back toward 64 px, with no frame at the overflowing size

#### Scenario: Below the minimum, the overflow applies

- **WHEN** the text cannot fit at half its authored size and its overflow is Ellipsis
- **THEN** it stays at half size and ends in an ellipsis on one line

### Requirement: Fit SHALL have one spelling, migrated so no old template changes unless it asked for fit

`fitMode: 'shrink-to-fit'` SHALL be the one spelling of fit. A registered scene migration SHALL
rewrite the legacy spellings on every load, in the Designer and in the on-air page: `autoSqueeze: true`
or `overflow: 'shrink'` on a fixed box SHALL become `fitMode: 'shrink-to-fit'`, and on an autosize box
only the legacy key SHALL go. A text that asked for none of them SHALL be returned unchanged — the same
object. The schema SHALL still parse the legacy values; nothing SHALL write them. The migration SHALL
run on the CasparCG CEF floor.

#### Scenario: An old auto-squeeze text now fits

- **WHEN** a scene saved with `autoSqueeze: true` on a fixed text is opened or played
- **THEN** the text is `fitMode: 'shrink-to-fit'` and fits on air, and `autoSqueeze` is gone

#### Scenario: A text that never asked is untouched

- **WHEN** a scene whose texts carry no fit request is migrated
- **THEN** every element is the same object as before and renders as before

### Requirement: The text Inspector SHALL offer Shrink to Fit on a fixed box, and Overflow while shrinking

The text Inspector SHALL offer `Shrink to Fit [Yes | No]` on a FIXED text box, writing
`fitMode: 'shrink-to-fit'` / `'fixed'`; an Auto box grows to its text and SHALL offer none. While it
shrinks, `Overflow [Clip | Ellipsis]` SHALL be offered. Sizing SHALL read Fixed for a shrink-to-fit
text, and pressing Fixed SHALL NOT switch the shrink off. The rows SHALL carry no explanatory prose,
and `DESIGNER-FIX-02`'s interim "not available" fact SHALL be gone.

#### Scenario: The control writes the one spelling

- **WHEN** the author sets Shrink to Fit to Yes on a fixed text
- **THEN** the element stores `fitMode: 'shrink-to-fit'`, Overflow appears, and Sizing still reads Fixed

## MODIFIED Requirements

### Requirement: Existing fitMode values are honored as authored

The runtime SHALL honor each text element's stored `fitMode` as authored — an existing scene or
starter template carrying `fitMode: 'autosize'` renders auto-sized, and one carrying
`fitMode: 'shrink-to-fit'` (or a legacy fit spelling the migration rewrites to it) renders shrunk to
fit — and the default `fitMode` for a newly created text element SHALL remain `fixed`, so new elements
are unaffected.

#### Scenario: A pre-existing autosize element now hugs

- **WHEN** a scene authored before this change has a text element with
  `fitMode: 'autosize'`
- **THEN** on load it renders auto-sized (hugging its content), honoring the
  stored value

#### Scenario: A pre-existing shrink-to-fit element now fits

- **WHEN** a scene authored before this change has a text element with `fitMode: 'shrink-to-fit'`
- **THEN** on load it shrinks to fit its box, where before it rendered like `fixed`

#### Scenario: New text elements default to fixed

- **WHEN** the operator adds a new text element
- **THEN** its `fitMode` defaults to `fixed` (its box uses `transform.size`)
