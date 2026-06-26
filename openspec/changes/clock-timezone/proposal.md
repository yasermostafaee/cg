# Clock: selectable time zone (D-084)

## Why

A digital `clock` element always shows the machine's local time in `wall` mode. Broadcast routinely
shows clocks for several cities/countries at once (a world-clock strip), which a local-only clock
can't express. Letting a clock carry an IANA time zone makes `wall` mode render that zone's current
time — the standard broadcast affordance — with no change to the count modes.

## What Changes

- `ClockElementSchema` gains an OPTIONAL `timezone` (an IANA zone name, e.g. `'Europe/London'`).
  Absent ⇒ local time (current behavior). This is a non-breaking additive widening, so **no
  schema-version bump and no migration** are needed — existing clocks parse and render unchanged
  (proven by parse/round-trip tests).
- The runtime wall-clock formatter derives the hour/minute/second in the element's `timezone` via
  `Intl.DateTimeFormat({ timeZone })` when set, else from the machine-local `Date` (unchanged). The
  format string, 12-hour/meridiem logic, and digit mapping (Persian/Arabic-Indic) are applied AFTER,
  exactly as before — so a zoned clock keeps Persian digits and the authored format.
- `countup`/`countdown` are unaffected (a countdown's `datetime` target is already absolute).
- The clock inspector section gains a time-zone picker (a Select of common IANA zones; a `Local`
  default = no `timezone`).

## Impact

- Affected specs: **designer-clock-element** (MODIFIED — wall mode gains the optional time zone).
- Affected code: `@cg/shared-schema` (`elements.ts` — one optional field), `@cg/template-runtime`
  (`clock-format.ts` Intl-based wall components, `clock-driver.ts` option, `runtime.ts` +
  `scene-builder.ts` wiring), `@cg/designer` (clock inspector Select + default).
- **No** schema-version bump / migration (additive optional field), no `.vcg` format change, no
  exporter change (the field serializes as plain JSON).
