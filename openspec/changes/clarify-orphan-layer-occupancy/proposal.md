## Why

The original HTML occupancy warning inferred output visibility and producer origin. The video
notice also inferred that another system placed an unclaimed producer. The bridge reports the
observed producer kind and layer.

## What Changes

- Identify HTML and video producers outside the stack. Ask the operator to check Program before clearing an HTML producer.
- Describe producer removal in the per-layer and batch Clear confirmations.
- Keep the existing confirmation, reachability and layer scope for each Clear.
- Synchronize a row's Play indication with a layer-addressed Clear acknowledged by its primary.

## Capabilities

### Modified Capabilities

- `runtime-ui`: Occupancy notices and Clear confirmation wording.
- `runtime-caspar-bridge`: authoritative stack status after a layer-addressed Clear.

## Impact

CG Control's occupancy banner, its accessible name and its Clear confirmations.
