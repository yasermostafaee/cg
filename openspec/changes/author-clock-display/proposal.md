# Author clock display (D-209)

## Why

A clock author needs fine control over separators and the choice of a minute-only count; a stopwatch sometimes starts at a nonzero value and stops counting at a ceiling.

## What Changes

- Expose spacing and vertical offset for separators in default and custom formats.
- Expose countdown minute and hour-minute formats.
- Allow countup to begin at a configured number of seconds and hold at an optional ceiling.

## Capabilities

### Modified Capabilities

- designer-clock-element

## Impact

Use the canonical formatter and retain its minute overflow calculation. Persist optional style and count fields on ClockElement. Share the separator painter between initial and running frames; blink must reserve the same horizontal space.
