## Why

B-425 shows a missing or unreachable UNC share as a generic permission error in CG Control. The
same failure also appears inline beside Save path and pushes the input out of its own control row.

## What Changes

- Check the selected folder from the Bridge service and distinguish an unreachable path from an
  access denial.
- Report a refusal once below the control row and preserve the entered path for correction.

## Capabilities

- `runtime-ui`: Shared files registration and refusal presentation.
- `desktop-delivery`: the Bridge service's validation of the shared files folder.

## Impact

CG Control Station setup and the CG Bridge folder validator. The station-admin boundary and
existing service configuration format remain in force.
