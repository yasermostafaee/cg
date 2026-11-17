## Implementation

- [x] Factor reserve D10 route validation into a shared diagnostic/seating resolver.
- [x] Warm independent reserve D10 and invalidate delayed reads across reconnects.
- [x] Add pinned, guarded, unjournaled reserve Playlist seating.
- [x] Include proven reserve route seats in paired geometry and native preset motion.
- [x] Add mapped route, stale epoch, delayed read and queue cancellation regressions.

## Verification

- [x] Final targeted build, typecheck, lint and regression run (83 route/guard, 10 backup-session,
      43 adapter tests; Bridge and adapter lint; Bridge typecheck; dependency build 8/8).
- [ ] Real 21.32/21.43 Playlist and preset acceptance after integrated Bridge deployment.

The two-axis sweep covers primary-only route wording and route/backup components. Existing
generic holder-route and failover refusal tests remain valid; this delta adds only an
independently resolved reserve Playlist exception. Historical archived contracts are not
rewritten as though they originally supported that exception.

Sweep path checks: 80 Bridge source files, 247 Bridge test files, two relevant base contract
files; 28 route/primary-only wording matches and 68 route/epoch/guard component matches.
