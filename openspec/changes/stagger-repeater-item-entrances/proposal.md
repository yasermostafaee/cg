# Change: Stagger Repeater item entrances

## Why

Repeaters currently stamp and reveal every row together. Broadcast tables, player lists and weather
cards often need a readable build where rows enter in authored order with a deliberate effect and
delay.

## What Changes

- Add an optional shared entrance effect, effect time and per-item delay to a Repeater.
- Reuse the existing Sequence edge/fade vocabulary so authors do not learn a second motion language.
- Run one pause-safe visual timeline over the stamped row wrappers while preserving the current row
  lifecycle and live-value semantics.
- Keep existing Repeaters unchanged: no effect means every row is visible immediately.

## Impact

- Affected PRD: D-181.
- Affected capabilities: `designer-repeater-element`.
- Affected packages: `@cg/shared-schema`, `@cg/template-runtime`, `@cg/designer`.
