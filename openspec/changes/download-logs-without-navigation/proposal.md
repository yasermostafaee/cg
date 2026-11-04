## Why

Download logs is intercepted by IDM as a normal web navigation. The one-use CG Bridge ticket may be
consumed without a saved archive, while CG Control reports success.

## What Changes

- Fetch the ticketed archive inside CG Control and save a local Blob URL.
- Expose only the ticketed log response for that cross-origin fetch.
- Report archive HTTP failures at the Download logs action.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control's bridge transport, CG Bridge's ticketed logs response, and focused transport tests.
