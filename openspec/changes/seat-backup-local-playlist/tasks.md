## Implementation

- [x] Factor reserve D10 route validation into a shared diagnostic/seating resolver.
- [x] Warm independent reserve D10 and invalidate delayed reads across reconnects.
- [x] Add pinned, guarded, unjournaled reserve Playlist seating.
- [x] Include proven reserve route seats in paired geometry and native preset motion.
- [x] Add mapped route, stale epoch, delayed read and queue cancellation regressions.

## Verification

- [x] Final targeted build, typecheck, lint and regression run (83 route/guard, 10 backup-session,
      43 adapter tests; Bridge and adapter lint; Bridge typecheck; dependency build 8/8).
- [x] Real 21.32/21.43 Playlist and preset acceptance after integrated `927412a7` Bridge
      deployment: the operator confirmed Playlist picture on B. A preset 3/2/3 transaction
      with linear motion and fade at 1000 ms recorded 60 decoded return frames per engine;
      both showed Playlist picture, departing-plate fade and retained-plate movement.
      Focus/Return at 800 ms was also visually checked on both engines and restored preset 3.
      Evidence: `candidate927-live-transition.json` and `candidate927-focus-return.json`
      in the local station evidence directory. This does not establish media-clock equality.
- [x] The integrated carrying [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      completed green on `261b57c8ae1840e96a3d10d6540c3094ad529239`, alongside the Linux heavy gate.
      Runtime passed 486/2 skipped; Designer passed 460 plus 1 flaky passing its configured
      retry/15 skipped; pack passed 2.

## Integration follow-up

- [x] Await every declared-bank startup volume write before route-test wire baselines. A
      delayed-startup regression fails with the previous fixed delay and passes with the
      bounded readiness check; refused source swaps still require an entirely empty wire.

The two-axis sweep covers primary-only route wording and route/backup components. Existing
generic holder-route and failover refusal tests remain valid; this delta adds only an
independently resolved reserve Playlist exception. Historical archived contracts are not
rewritten as though they originally supported that exception.

Sweep path checks: 80 Bridge source files, 247 Bridge test files, two relevant base contract
files; 28 route/primary-only wording matches and 68 route/epoch/guard component matches.
