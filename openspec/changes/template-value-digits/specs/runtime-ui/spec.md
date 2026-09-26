## MODIFIED Requirements

### Requirement: Persian/Arabic-Indic digits are accepted in numeric inputs and normalized to canonical digits

Every Runtime CONSOLE numeric input SHALL accept Persian digits (۰–۹) and Arabic-Indic digits
(٠–٩), normalizing them to canonical Latin digits (0–9) on input — typing and paste alike — via
ONE shared numeric-input primitive that reuses `@cg/text-shaping`'s `latinDigits` (never a
locally re-derived digit map). A console numeric input is a number the console itself owns: a
server port, a device index, a route channel or layer, a position offset, a timing override, the
lock PIN. The primitive SHALL NOT be a browser `type="number"` input (which drops non-Latin digits
before script observes them). Stored and transmitted values SHALL be canonical Latin digits.
Numeric inputs that accept a decimal value SHALL also normalize the Persian decimal separator ٫
(U+066B) to "."; integer-only inputs SHALL leave ٫ for their validation to reject. Any
pattern-shaped numeric validation SHALL validate the normalized value, so a numeric pattern never
rejects Persian-typed digits. Text-type fields SHALL be untouched — their content is kept verbatim,
never digit-normalized.

A TEMPLATE VALUE is not a console number. The Inspector's `number` field SHALL render the same
primitive in its AS-TYPED mode, which displays the operator's text unchanged and reads it through
`template-value-digits`' one reader; its staged and transmitted value is still the canonical
number.

#### Scenario: Persian-typed digits commit as canonical

- **WHEN** the operator types Persian digits (۰–۹) or Arabic-Indic digits (٠–٩) into a console
  numeric input — a position offset, a server port — **THEN** the digits are accepted and
  normalize on input, the control displays Latin digits, and the stored/transmitted value is
  canonical Latin digits

#### Scenario: The Inspector's number field keeps the operator's digits on screen

- **WHEN** the operator types `۱۲۸` into a template's `number` field in the Inspector **THEN** the
  field shows `۱۲۸` and the staged value is the number 128

#### Scenario: A pasted non-Latin numeric value normalizes the same way

- **WHEN** a value containing Persian or Arabic-Indic digits is pasted into a Runtime console
  numeric input **THEN** it normalizes exactly as typed input does

#### Scenario: Numeric validation sees canonical digits

- **WHEN** a numeric input with pattern-shaped validation (the port inputs' integer rule)
  receives Persian-typed digits **THEN** validation runs against the normalized value and
  does not reject them as non-numeric

#### Scenario: Decimal inputs accept the Persian decimal separator

- **WHEN** the operator types ٫ (U+066B) into a console numeric input that accepts a decimal
  value **THEN** it normalizes to "." and the value commits as the decimal it denotes

#### Scenario: Text fields stay verbatim

- **WHEN** the operator types Persian digits into a text-type field **THEN** the content
  is kept verbatim — no digit normalization is applied

#### Scenario: A Persian-typed lock PIN matches

- **WHEN** a lock PIN is engaged with digits typed in one digit set and released with the
  same digits typed in another (۱۲۳۴ then 1234, or the reverse) **THEN** the release
  succeeds — digits in the PIN normalize identically at engage and at release, while
  non-digit PIN characters pass through verbatim
