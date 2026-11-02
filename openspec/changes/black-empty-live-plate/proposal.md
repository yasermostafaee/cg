## Why
A valid source can temporarily carry no picture. Its transparent output makes the authored frame disappear even though the mapping is valid.

## What Changes
- Provide an opaque black fallback beneath a valid live plate.
- Preserve refusal behavior for invalid/unavailable sources.

## Capabilities
### Modified Capabilities
- `runtime-live-source-routing`

## Impact
Live-plate seating/layer ownership, AMCP command planning, cleanup and hardware verification.
