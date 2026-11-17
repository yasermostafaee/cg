## Why

CG Control forgets a dismissed failover notice when reopened, while the running Bridge still reports the same event. A legacy enabled auto-failover setting also remains active on Playout stations, despite Playout owning transfers.

## What Changes

- Keep completed direct-station event acknowledgements per configured server pair and operator across console restarts.
- Show new events and keep genuine connection alarms visible.
- Suppress legacy CG transfer history in Playout mode and disable legacy automatic switching at runtime construction and reconfiguration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-ui`: Durable failover acknowledgements and Playout-appropriate notices.
- `runtime-caspar-bridge`: Playout retains automatic transfer authority regardless of legacy settings.

## Impact

Runtime notification rendering, browser-local acknowledgement storage and the existing Bridge redundancy adapter configuration. No server configuration or on-air commands are changed by dismissal.
