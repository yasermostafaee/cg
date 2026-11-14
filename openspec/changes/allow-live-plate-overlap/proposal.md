## Why

Some layouts deliberately place one live frame in front of another. The author can restrict
overlap for a composition. By default, Designer and the station show the same authored order.

## What Changes

- Show the default-checked **Allow live plate overlap** option in the Composition Inspector and under
  **CG Control** while editing one or several live plates.
- Resolve co-visible plates in each preset using the authored paint order, including nested frames.
- Carry that order into Preview and programme. Refuse an order the station cannot realize safely.
- Keep existing overlap validation and valid linked reveals when the option is off.

## Capabilities

### Modified Capabilities

- `designer-live-source`: composition setting, paint order and authoring preflight.
- `runtime-live-source-routing`: safe placement and preset transitions in authored order.

## Impact

Designer composition settings and export, the live-source carrier, and CG Bridge seat planning.
