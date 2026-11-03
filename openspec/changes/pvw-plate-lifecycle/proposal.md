## Why

PVW draws Live Source markers before Play while the template itself is pending, and retains a Safe Area control the operator does not use.

## What Changes

- Gate Live Source markers on the local PVW lifecycle.
- Remove Safe Area control and guide rendering.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

PVW transport/stage state, marker overlay, DOM and E2E tests.
