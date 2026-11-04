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
- Add an optional exit effect through the existing outro lifecycle, including Repeaters inside
  Sequence composition pages; background exit waits for the visible row build-down.
- Expose exit order independently of effect direction, defaulting to last-to-first while entrance
  remains first-to-last (top-to-bottom for a table).
- Give entrance and exit separate durations while inheriting the prior duration in existing scenes.
- Preserve paused and interrupted entrances without flashing hidden rows on Stop; scrub and Canvas
  playback use the same motion contract.
- Budget the never-strand watchdog from finite authored exits, including a Sequence page's inner
  row exit, so legal long effects are not cut at thirty seconds. Pause consumes no active-time
  budget; replay/removal cancel the old guard.
- Expose derived row numbering and alternating row fill as normal authoring controls. New rendering
  contracts require CG Control 1.1.0; older scenes keep their existing no-effect behavior.

## Impact

- Affected PRD: D-197.
- Affected capabilities: `designer-repeater-element`.
- Affected packages: `@cg/shared-schema`, `@cg/template-runtime`, `@cg/designer`.
