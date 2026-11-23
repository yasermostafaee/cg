## Why

The original normal page navigation could hand the one-use ticket to a download manager.
CG Control now fetches it directly. Operators need to choose the ZIP destination and see
confirmation when the selected file is fully written.

## What Changes

- Open Windows Save As from the installed Control's Audit log.
- Open the browser's file picker when the browser exposes it and the operator's click grants
  activation. Use a local Blob download when the picker is unavailable.
- Treat a canceled picker as a canceled action without writing a ZIP or showing success.
- Report the saved path on Windows and the selected filename through the browser picker after
  the write completes. Preserve failures and the existing Bridge ticket authorization.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control's Bridge transport, native Windows archive save and Audit feedback. The Bridge
still controls access to the ticketed log response.
