## Why

A valid source can temporarily carry no picture. Its transparent output makes the authored frame disappear even though the mapping is valid.

## What Changes

- Paint the Designer-selected Bars/solid-colour/picture fallback beneath a valid live plate.
- Keep Bars as the backward-compatible default and show a real Bars thumbnail in the picker.
- Keep the fallback on the Bridge-resolved visible fit of the producer.
- Preserve refusal behavior for invalid/unavailable sources.

## Capabilities

### Modified Capabilities

- `runtime-live-source-routing`

## Impact

Designer Live Source styling, export asset closure, Bridge→page fit control and hardware verification.
