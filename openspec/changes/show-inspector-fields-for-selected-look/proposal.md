## Why

A live layout can expose separate fields in each preset. Showing all those groups together makes it hard to find the current preset's controls.

## What Changes

- Show the selected Look's dynamic fields alongside common fields in Inspector.
- Keep edits for other Looks in the row draft when the operator changes selection.
- Carry the managed composition instance ID in the template catalogue.

## Capabilities

### New Capabilities

- `runtime-inspector-look-fields`: Scope Inspector fields to the selected Look.

## Impact

CG Control Inspector, the VCG Look carrier and the template catalogue schema.
