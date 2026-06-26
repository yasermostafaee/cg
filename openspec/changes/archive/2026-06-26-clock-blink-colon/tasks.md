# Tasks — Clock: blinking colon separator (D-103)

## 1. Schema

- [x] 1.1 `@cg/shared-schema` `elements.ts` — add optional `blinkColon` (boolean) and
      `blinkPeriodMs` (positive integer) to `ClockElementSchema`. No version bump, no migration.
- [x] 1.2 Round-trip test (`tests/elements.test.ts`): an OLD clock parses unchanged (both absent);
      a NEW clock preserves `blinkColon` + `blinkPeriodMs`; a non-positive period is rejected.

## 2. Runtime

- [x] 2.1 `clock-driver.ts` — `ClockDriverOptions` gains `blinkColon` + `blinkPeriodMs`. When on,
      `paint()` renders the time as colon / non-colon segment spans inside the time node and toggles
      ONLY the colon spans' OPACITY from `Math.floor(clock.now() / period) % 2`; when off, the
      `textContent` path is unchanged. `reset()` returns to a steady value.
- [x] 2.2 `runtime.ts` — pass `blinkColon` + `blinkPeriodMs` into the `ClockDriver`.
- [x] 2.3 Deterministic unit test (`tests/clock-driver.test.ts`): a blink clock toggles the colon
      span's opacity across a period boundary; the digits don't reflow within a second; a different
      period changes the cadence; off renders steady `textContent` (no colon spans).

## 3. Inspector

- [x] 3.1 `StyleSection.tsx` `ClockSections` — a blink toggle (off/on Select) + a rate (period ms)
      `NumberField`, committing via `updateElement`. `element-defaults.ts` `defaultClock` leaves both
      omitted (steady — the unchanged default).

## 4. E2E + Gate

- [x] 4.1 `tests/e2e/clock.spec.ts` — enable blink in the inspector (the rate control appears); on
      Play the preview renders the colon as its own `[data-cg-clock-colon]` span (the per-period
      opacity toggle is the unit tests' job).
- [x] 4.2 Folded into the branch's ONE combined green gate (turbo `--force`): `@cg/shared-schema` +
      `@cg/template-runtime` + `@cg/designer` — green (20/20 tasks; 224 + 400 + 549 unit tests;
      full E2E 104 passed).
