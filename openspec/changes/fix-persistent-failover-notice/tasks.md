## Implementation

- [x] Persist acknowledgement per station, operator and event.
- [x] Suppress completed legacy events on Playout stations and keep live alarms.
- [x] Disable legacy automatic switching at both runtime adapter creation sites.

## Validation

- [x] DOM regressions for restart, new events, station/user isolation and Playout alarms.
- [x] Two-AMCP-fixture regressions before and after reconfiguration, with direct-station controls.
- [x] Built-page browser reload regression, 1 Edge test passed.
- [x] Final Runtime and Bridge typecheck, scoped lint, formatting and strict OpenSpec validation.

- [x] Integrated full local gate passed 103/103 tasks; the actual carrying
      [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      completed green on `261b57c8ae1840e96a3d10d6540c3094ad529239`, alongside the Linux heavy gate.
      Runtime passed 486/2 skipped; Designer passed 460 plus 1 flaky passing its configured
      retry/15 skipped; pack passed 2.
- [x] Verify the three native 1.2.11 installers from `77dcba4a`, whose product tree is
      byte-identical to the later green carrier; only the later E2E fixture differs.
