## Why

Export is a project delivery action, but its filename follows the open composition and every Designer notice uses an error-red border.

## What Changes

- Suggest the project name for `.vcg` and HTML exports.
- Keep export visibly busy while it runs.
- Give successful writes a success notice while retaining persistent failure treatment.

## Capabilities

### Modified Capabilities

- `designer-composition-export`

## Impact

Designer renderer state, export bridge request, save-dialog naming, and export UI tests.
