## Why
CG Control reconciles an authored fixed file source but leaves the template's sample/default value staged until Reload is pressed.

## What Changes
- Automatically read and stage a newly reconciled authored source once.
- Do not repeatedly overwrite later operator edits.

## Capabilities
### Modified Capabilities
- `runtime-ui`

## Impact
Inspector file-source reconciliation, async staging and tests.
