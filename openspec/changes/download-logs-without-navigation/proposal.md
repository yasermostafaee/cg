## Why

The original normal page navigation could hand the one-use ticket to a download
manager. CG Control now fetches it directly. On the reported Windows workstation,
the ZIPs were in Downloads while Audit showed no location or completion.

## What Changes

- Fetch the ticketed archive inside CG Control and retain the browser's local Blob save.
- Report the actual saved ZIP path in Windows Audit after the native write completes.
- Retain existing files when a name is already in use.
- Show archive HTTP and local write failures in Audit. Keep the Bridge ticket and its
  existing authorization.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control's Bridge transport, native Windows archive save and Audit feedback. The
Bridge still controls access to the ticketed log response.
