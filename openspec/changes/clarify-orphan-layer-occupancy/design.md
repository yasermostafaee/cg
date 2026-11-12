## Context

The occupancy sweep uses the reported producer kind and channel-layer to find occupied layers
outside the operator's stack. That observation leaves output visibility and producer origin unknown.

## Decisions

- The alert and each row identify HTML occupancy outside the stack. The warning directs the
  operator to Program to check the output.
- Clear confirmations name each target and describe the removal of its producer. Clear continues
  through the existing per-layer command and its current guards.
