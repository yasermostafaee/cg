# Change: Prevent the Sequence/Repeater default-data flash

## Why

A Sequence composition page can contain a Repeater whose authored rows are only a design shell. On
Take, the runtime currently reveals that mounted shell before the Sequence reset builds the current
page with its item/operator rows, so the wrong data can be visible for the first frame.

## What Changes

- Keep the stage pending while every data-driven subtree is reset from current values.
- Reveal only after the current Sequence page and its nested Repeater contain their final Take data.
- Pin the reveal boundary with a focused runtime regression.

## Impact

- Affected PRD: B-414.
- Added capability: `sequence-repeater-data-reveal`.
- Affected package: `@cg/template-runtime`.
