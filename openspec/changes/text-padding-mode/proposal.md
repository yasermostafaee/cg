## Why
Uniform text padding requires four identical edits while Border Radius already offers a clear uniform/detail switch.

## What Changes
- Store padding as either one uniform number or four per-side values.
- Add a uniform/per-side toggle with value and animation migration.
- Keep canvas, preview and export rendering identical.

## Capabilities
### Modified Capabilities
- `designer-inspector`

## Impact
Shared schema, animation property paths, Designer Inspector, template renderer and compatibility tests.
