# Surface Rule and Step participation in Timeline rows (D-203)

## Why

Timeline rows already expose Data-key participation with a Key badge, but Value Rules and Countdown
Steps remain invisible until the author opens the relevant inspector. That makes automated changes
look unexplained and is especially confusing when a Step targets a different element.

## What Changes

- Add a Rule badge when an element owns one or more Value Rules.
- Add a Step badge to a countdown that owns Steps and to every explicitly changed target element.
- Keep the badges compact, visually distinct and accessible by label/title.

## Capabilities

### Modified Capabilities

- `designer-animation-timeline`

## Impact

Designer Timeline row rendering and the shared Countdown-Step relationship query only. No scene
schema or output behavior changes.
