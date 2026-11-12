## Why

Some layouts deliberately place one live frame in front of another. The author needs to opt in
to this layout and see the same overlap in Designer and on the station.

## What Changes

- Add an unchecked **Allow live plate overlap** option in the Composition Inspector.
- Resolve co-visible plates in each preset using the authored paint order, including nested frames.
- Carry that order into Preview and programme. Refuse an order the station cannot realize safely.
- Keep existing overlap validation and valid linked reveals when the option is off.

## Capabilities

### Modified Capabilities

- `designer-live-source`: composition opt-in, paint order and authoring preflight.
- `runtime-live-source-routing`: safe placement and preset transitions in authored order.

## Impact

Designer composition settings and export, the live-source carrier, and CG Bridge seat planning.
