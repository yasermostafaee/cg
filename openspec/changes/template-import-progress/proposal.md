## Why

Importing a large `.vcg` can spend several seconds verifying, unpacking, rendering and registering
the template. After the file chooser closes the Templates dialog currently looks idle, so an
operator can press Import, Load or Cancel again without knowing the first import is still running.

## What Changes

- Show a clear in-dialog loading state only after a `.vcg` file has actually been selected.
- Name the selected file and explain that it is being verified and prepared.
- Temporarily block conflicting picker actions and dismissal until the import succeeds or fails.
- Return to the existing selected-template or refusal state when the import settles.

## Capabilities

### Modified Capabilities

- `runtime-template-library`: template import has an explicit pending state.

## Impact

- CG Control Templates dialog UI and DOM/E2E coverage.
- No package, bridge, persistence or on-air protocol change.
