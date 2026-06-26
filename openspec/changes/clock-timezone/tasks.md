# Tasks — Clock: selectable time zone (D-084)

## 1. Schema

- [x] 1.1 `@cg/shared-schema` `elements.ts` — add an optional `timezone` string to
      `ClockElementSchema` (after `target`). No `CURRENT_SCHEMA_VERSION` bump, no migration.
- [x] 1.2 Round-trip tests (`tests/elements.test.ts`): an OLD clock (no `timezone`) parses unchanged;
      a NEW clock (with `timezone`) parses and preserves the value.

## 2. Runtime

- [x] 2.1 `clock-format.ts` — `formatWallClock` gains an optional `timezone`. When set, derive the
      hour/minute/second in that zone via `Intl.DateTimeFormat` parts (mapping a `24` hour to `0`);
      else use the machine-local `Date` methods. Token logic + digit mapping run after, unchanged.
- [x] 2.2 Unit tests (`tests/clock-format.test.ts`): a fixed epoch formats to the expected wall time
      in a chosen IANA zone, including Persian digits; an unset `timezone` equals the local result.
- [x] 2.3 `clock-driver.ts` — add an optional `timezone` to `ClockDriverOptions`; thread it into the
      wall formatter in `clockInitialText` and `currentText`. `countup`/`countdown` untouched.
- [x] 2.4 `runtime.ts` + `scene-builder.ts` — pass `element.timezone` into the driver and the static
      initial render.

## 3. Inspector

- [x] 3.1 `StyleSection.tsx` `ClockSections` — a time-zone Select (common IANA zones + a `Local`
      default that clears `timezone`) shown for wall clocks; commits via `updateElement`.
- [x] 3.2 `element-defaults.ts` `defaultClock` — `timezone` left omitted (absent means local); no
      change needed since the field is optional and defaults to absent.

## 4. E2E

- [x] 4.1 `tests/e2e/clock.spec.ts` — set a clock's time zone via the inspector; the authoring canvas
      renders a different hour for two zones 16–17h apart (proves the zone reaches the render; the
      per-zone formatting correctness is the clock-format unit tests' job).

## 5. Gate

- [ ] 5.1 Combined green gate (batched with D-039ext): `@cg/shared-schema` + `@cg/template-runtime` +
      `@cg/designer` `format:check` + `typecheck` + `lint` + `test` + `build` (turbo `--force`).
