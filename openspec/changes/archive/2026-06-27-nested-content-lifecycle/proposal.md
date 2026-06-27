# Nested-composition content participates in the parent's lifecycle (D-104)

## Why

A rotating news-title (clock+text) is authored as composition items → **nested
compositions**, but content-driven holds are per-scope today:

- the designer's `hasContentElement` (`PlayoutSection.tsx`) doesn't recurse into
  `composition` instances, so the **content-driven hold control isn't offered**
  for a parent whose finite content lives in a nested composition;
- the runtime's per-scope content wait (`runtime.ts`) waits only for a scope's
  **own** direct tickers/sequences/countdowns, so a parent with content only in a
  nested composition gets a **zero-length hold** and plays its background out
  before the nested content finishes;
- a nested composition cascades on play, so its content starts the **instant Play
  is pressed** instead of after the parent's intro.

Net effect: the parent background closes before the nested sequence finishes, and
the sequence shows too early.

## What Changes

- **UI (a)** — `hasContentElement` recurses into `composition` element instances
  (resolving the referenced composition's layers via `scene.compositions`, with a
  visited-set cycle guard), exactly as it already recurses into `container`. So the
  content-driven hold is OFFERED for a parent whose finite content lives in a
  nested composition.
- **Runtime (b)** — a content-driven scope (a "coordinator": `mode !== 'manual'`
  and `holdSource: 'content-driven'`) holds until its OWN content **and** every
  _non-coordinator_ nested composition's content completes (`Promise.all`). A
  content-driven nested composition stays independent (the parent skips it — it
  self-settles), preserving today's per-scope holds. Infinite nested content holds
  the parent until `stop()`. The root `contentHold` override still wins for the
  root scope.
- **Runtime (c)** — a non-coordinator scope under a coordinator ancestor does NOT
  start its own content drivers; the coordinator ancestor resets+starts them at the
  PARENT's hold-start, so nested content begins after the parent's intro (during
  the parent's hold), not on the play cascade. A scope with no coordinator ancestor
  keeps the old per-scope start behavior.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): the content-completion requirement now
  aggregates non-coordinator nested-composition content and gates nested-content
  start on the parent's hold-start; ADDED: the hold control is offered when finite
  content lives in a nested composition.

## Impact

- `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx`
  (`hasContentElement`).
- `packages/template-runtime/src/runtime.ts` (`wireScope`: coordinator detection,
  `ScopeNode` aggregation fields, recursive `startContentTree`/`contentTreeWait`,
  controller `onHoldStart`/`waitForContent` wiring).
- Tests: new runtime tests for nested aggregation + start timing + infinite; the
  existing `ticker-runtime` "finite root self-settle" test is reframed to use a
  content-driven (coordinator) nested comp; a designer E2E for the offered control.
- No schema change, no version bump, no migration (purely behavioral + a UI gate).
