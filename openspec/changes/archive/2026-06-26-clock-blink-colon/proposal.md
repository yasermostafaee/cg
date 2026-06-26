# Clock: blinking colon separator (D-103)

## Why

A blinking colon between HH:MM:SS is a classic broadcast / digital-clock cue (seconds passing,
"live"). The clock renders steady colons today; an optional pulse adds the familiar look.

## What Changes

- `ClockElementSchema` gains two OPTIONAL fields: `blinkColon` (boolean) and `blinkPeriodMs`
  (positive integer, default 1000 ms). Off by default — a clock without them renders steady colons,
  unchanged. This is an additive widening, so **no schema-version bump and no migration** are
  needed.
- The clock runtime, when `blinkColon` is on, renders the formatted time as segment spans so each
  colon (`:`) lives in its OWN span, and the driver toggles ONLY those spans' OPACITY from the time
  source (`Math.floor(now / blinkPeriodMs) % 2`) — no digit reflow, no layout shift, no separate
  timer. It applies to wall/countup/countdown; Persian digits are unaffected. When off, the prior
  single-`textContent` render is unchanged.
- The preview and the exported single-file HTML run the blink identically (same runtime source).
- The clock inspector gains a blink toggle + a rate (period ms) control.

## Impact

- Affected specs: **designer-clock-element** (ADDED — "Blinking colon separator").
- Affected code: `@cg/shared-schema` (`elements.ts` — two optional fields), `@cg/template-runtime`
  (`clock-driver.ts` — colon-segment render + opacity blink; `runtime.ts` wiring), `@cg/designer`
  (clock inspector + default).
- **No** schema-version bump / migration, no `.vcg` format change, no exporter change.
