## Implementation

- [x] Persist acknowledgement per station, operator and event.
- [x] Suppress completed legacy events on Playout stations and keep live alarms.
- [x] Disable legacy automatic switching at both runtime adapter creation sites.

## Validation

- [x] DOM regressions for restart, new events, station/user isolation and Playout alarms.
- [x] Two-AMCP-fixture regressions before and after reconfiguration, with direct-station controls.
- [x] Built-page browser reload regression, 1 Edge test passed.
- [x] Final Runtime and Bridge typecheck, scoped lint, formatting and strict OpenSpec validation.

Integrated release gate and installer builds are owned by the release coordinator.
