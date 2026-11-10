# Independent PVW and programme (R-117)

## Why

A layer must stay available for preview while on air so the operator can check Inspector changes before sending them to programme.

## What Changes

- Enable a browser-only preview record without the legacy mute or Take interlock.
- Keep ON PVW and Play independently indicated for a loaded row.
- Keep the Inspector draft in PVW; programme uses the applied values until explicit Update on air.

## Capabilities

### Modified Capabilities

- runtime-ui
- runtime-caspar-bridge

## Impact

CG Control preview controls, typed Bridge routes, and air-path and browser regression checks.
