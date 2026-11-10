# Coordinate Follow video with the composition Outro (B-431)

## Why

The supplied project has a composition-following background video and a plain Text opacity fade from frame 510 to 539. Stop lets the video run its whole outro before the text keyframes start.

## What Changes

- Keep the text on the authored Outro clock while Follow media exits.
- Allow a designed text-first exit rather than imposing a video-first exit.

## Capabilities

### Modified Capabilities

- designer-playout-lifecycle

## Impact

Separate a composition-following media exit from independent element-owned Outros. Keep one authoritative composition cursor, avoid a second Outro pass, and preserve pause, replay and nested scope ownership.
