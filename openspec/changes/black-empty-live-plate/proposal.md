## Why

A valid source can temporarily carry no picture. Its transparent output makes the authored frame disappear even though the mapping is valid.

## What Changes

- Paint the Designer-selected Bars/solid-colour/picture fallback beneath a valid live plate.
- Keep the chosen background visible in Designer and PVW. Apply Show fallback on air only in PGM.
- Use Bars for new plates and legacy plates without a choice. Show a Bars thumbnail in the picker.
- Align the full-picture output fit with rasterized fallback edges while preserving contain margins and mask windows.
- Suppress the incoming plate fallback during the page-to-mixer handoff of a preset change.
- Preserve refusal behavior for invalid/unavailable sources.

## Capabilities

### Modified Capabilities

- `runtime-live-source-routing`

## Impact

Designer Live Source styling, export asset closure, Bridge→page fit control and hardware verification.
