# Design: Staggered Repeater entrances

## Authoring contract

Each Repeater owns three additive values:

- `itemEntrance`: one existing Sequence edge/fade value; `none` is the compatibility default;
- `itemTransitionMs`: duration of one row's entrance;
- `itemStaggerMs`: delay from one row's start to the next row's start.

Rows always build in authored/list order. Row zero starts at play time and row N starts at
`N × itemStaggerMs`. A zero stagger intentionally starts every row together while still allowing a
shared effect.

## Runtime model

The entrance is a visual wrapper timeline, not a second row lifecycle. Stamped row scopes still
start, pause, update and exit through the existing D-030 cascade. This preserves bound-value updates,
content-driven holds, countdowns, videos and nested drivers without inventing delayed field state.

For an enabled effect the scene builder adds a motion wrapper inside each fixed, clipped row cell.
The wrapper moves/fades, so a row cannot leak into a neighbouring cell while entering. Repeaters
without an effect retain the legacy DOM shape. The driver samples the existing Sequence motion
mapper, owns one injected requestAnimationFrame clock, freezes active elapsed time on pause, and
cancels/restores deterministically on stop, reset and destroy.

## Authoring and preview state

Rows are stamped at rest before play so the Designer can edit the complete table. Preview and output
start the stagger on Play. Live list shrink/regrowth keeps the current stamped-count contract; a
re-shown row adopts the current entrance pose rather than restarting the whole build.

## Compatibility

All fields are additive and optional. Existing projects keep them absent; every reader interprets
absence as `itemEntrance: none`, `itemTransitionMs: 400`, `itemStaggerMs: 0` and renders exactly as
before. Newly drawn Repeaters author those values explicitly.

## Non-goals

- Delaying each child composition's lifecycle start (the broader D-032 model).
- Per-row effects or per-row delay overrides.
- Exit staggering or live row-count animation.
