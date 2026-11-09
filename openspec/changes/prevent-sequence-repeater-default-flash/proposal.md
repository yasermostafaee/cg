# Change: Prevent the Sequence/Repeater default-data flash

## Why

A Sequence composition page can contain a Repeater whose authored rows are only a design shell. On
Take, a prepared page's animated row can override the inherited visibility of its hidden page and
the pending stage. In Chromium, 24 cities from later pages painted before Play.

## What Changes

- Keep the stage pending while every data-driven subtree is reset from current values.
- Reveal only after the current Sequence page and its nested Repeater contain their final Take data.
- Keep prewarmed pages fully transparent until their own entry and verify real browser frames.

## Impact

- Affected PRD: B-414.
- Added capability: `sequence-repeater-data-reveal`.
- Affected package: `@cg/template-runtime`.
