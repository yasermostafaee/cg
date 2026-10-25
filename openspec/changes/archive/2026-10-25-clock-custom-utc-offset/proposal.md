# Clock: custom UTC offset (D-134)

## Why

The wall clock can show the machine's local time or a curated IANA time zone. An author who needs a
fixed broadcast offset such as `+03:30` should not have to choose a city whose civil-time rules may
change or whose name is unrelated to the graphic. The offset must be explicit in the Inspector and
must render identically on the Designer canvas, in Preview and in the exported template.

## What Changes

- `ClockElementSchema` gains an optional `utcOffsetMinutes`, constrained to whole minutes from
  `-14:00` through `+14:00`. It is mutually exclusive with `timezone`; absence of both preserves
  machine-local time.
- The wall-clock formatter can derive components from a fixed UTC offset. This is arithmetic on the
  absolute instant, deliberately without IANA/DST rules. Countup and countdown ignore the field.
- The clock Inspector exposes only `Local` and `Custom offset`. The custom value is a fixed
  `±HH:MM` mask: separators belong to the control, letters cannot enter it, and impossible values
  are refused before display. Latin, Persian and Arabic-Indic digits are accepted.
- Existing `timezone` data remains schema/runtime-compatible but is no longer authorable in the
  Inspector. The optional additive field needs no schema-version bump or migration, and ordinary
  JSON export already carries it.

## Impact

- Affected spec: `designer-clock-element`.
- Affected code: `@cg/shared-schema`, `@cg/template-runtime`, and the Designer clock Inspector.
- Tests: schema compatibility/exclusivity, fixed-offset formatting and wrapping, parser/formatter,
  runtime wiring, and a Designer E2E proving canvas output changes with the authored offset.
