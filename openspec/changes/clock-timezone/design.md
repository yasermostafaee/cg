# Design — Clock time zone (D-084)

## Non-breaking, no migration

`timezone` is an OPTIONAL field; absent = local (today's behavior). Per the explicit decision on
this branch, there is **no `CURRENT_SCHEMA_VERSION` bump and no migration entry** — the addition is
a pure widening, proven by parse/round-trip tests (an old clock without the field still parses; a new
clock preserves it). The clock schema stays at scene `schemaVersion: 1`.

## Why `Intl.DateTimeFormat`, not offset math

Time-zone rules (DST, historical offsets) belong to the platform's IANA tz database, not hand-rolled
offset arithmetic. We extract the wall-clock h/m/s for the target zone via
`Intl.DateTimeFormat('en-US', { timeZone, hour12: false, hour/minute/second: '2-digit' })
.formatToParts(date)` and feed those integers into the SAME token engine that local clocks use — so
the format string, 12-hour conversion, meridiem, and digit mapping (which all run afterwards) are
identical for local and zoned clocks.

- Guard: `hour12: false` can emit `'24'` for midnight in some engines → map `24 → 0`.
- The `en-US` locale is only used to get ASCII Latin digit parts; the element's own `digits`
  mapping (Persian/Arabic-Indic) is applied after, unchanged.

## Schema field name vs Intl option

The schema field is `timezone` (per the PRD); the `Intl` option is `timeZone`. The single mapping
(`{ timeZone: timezone }`) is localized inside `clock-format.ts`; the driver option and the wiring
carry `timezone` to match the schema.

## Scope: only `wall` is zoned

`countup` is elapsed ACTIVE time (zone-irrelevant); `countdown`'s `datetime` target is already an
absolute instant (a real deadline) and its `duration` target is relative — so neither count mode
reads `timezone`. The driver passes `timezone` only into the wall formatter.
