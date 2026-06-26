# Design — Clock blinking colon (D-103)

## Non-breaking, no migration

`blinkColon` + `blinkPeriodMs` are OPTIONAL; absent ⇒ steady colons (today's behavior). Per the
branch decision (same as D-084), there is no `CURRENT_SCHEMA_VERSION` bump and no migration —
proven by a parse/round-trip test (old clock parses unchanged; new clock preserves both fields).

## Opacity, not display; segment only when blinking

"No digit reflow / layout shift" ⇒ toggle the colon span's OPACITY (its box stays), never
`display`. The driver segments the formatted string into colon vs non-colon runs ONLY when
`blinkColon` is on; when off it keeps the single-`textContent` render (zero risk to the existing
gradient / tabular-nums path). The segment spans sit INSIDE the existing `[data-cg-clock-time]`
span, so its `textContent` still reads the full time — the clock unit tests + E2E are unchanged.

## Driven by the time source, no separate timer

The blink phase is `Math.floor(clock.now() / period) % 2` (period = `blinkPeriodMs ?? 1000`),
evaluated inside the driver's EXISTING rAF paint loop — no `setInterval`. The loop already runs each
frame for wall/countup/countdown, so the colon toggles when the phase flips while the digits update
on their own ~1/s cadence; both write the DOM only on change. Persian/Arabic-Indic digit mapping is
upstream of segmentation (the colon `:` is never a digit), so digits are unaffected. `reset()`
returns to a steady single-`textContent` value (the between-runs / authoring display does not
blink); the run's first paint rebuilds the segments.

## Test determinism

The injected `RuntimeClock` makes the blink deterministic: advance the fake clock across a period
boundary and assert the colon span's opacity toggles; change `blinkPeriodMs` and assert the cadence
follows; with `blinkColon` off, assert the steady `textContent` render (no colon spans).
