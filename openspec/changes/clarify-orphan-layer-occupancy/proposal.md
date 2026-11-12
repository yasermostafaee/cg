## Why

The HTML occupancy warning tells the operator that a producer is on air and suggests a previous
session left it behind. The bridge reports only the observed producer kind and layer.

## What Changes

- Identify HTML producers outside the stack and ask the operator to check Program before clearing.
- Describe producer removal in the per-layer and batch Clear confirmations.
- Keep the existing confirmation, reachability and layer scope for each Clear.

## Capabilities

### Modified Capabilities

- `runtime-ui`: HTML occupancy warnings and Clear confirmation wording.

## Impact

CG Control's occupancy banner, its accessible name and its Clear confirmations.
