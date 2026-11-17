## Why

An engine outage lasting a few seconds should return verified programme graphics without requiring an operator to retake them.

## What Changes

- Add a configurable 0–30 second recovery window for Playout-linked stations, defaulting to five seconds.
- Recover only previously confirmed, now-vacant rows on the returning Bridge primary.
- Keep the operator confirmation path for long, ambiguous, or unsuccessful recovery.

## Capabilities

### Modified Capabilities

- `runtime-caspar-bridge`: bounded programme recovery after a Playout-linked AMCP reconnect.
