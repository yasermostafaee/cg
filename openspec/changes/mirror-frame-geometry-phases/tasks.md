## Implementation

- [x] Reuse the verified preset peer transaction for eligible same-look frame placement.
- [x] Keep final recording and rollback within the existing geometry lifecycle.
- [x] Add paired native/artwork, unproven-producer and rollback/retry regressions.

## Validation

- [x] Complete live-seating integration file, 143 tests passed.
- [x] Bridge typecheck, scoped lint, formatting and strict OpenSpec validation.

- [x] The integrated full local gate passed 103/103 tasks and the actual carrying
      [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      completed green on `261b57c8ae1840e96a3d10d6540c3094ad529239`. Runtime passed 486/2 skipped;
      Designer passed 460 plus 1 flaky passing its configured retry/15 skipped; pack passed 2.
- [x] Verify all three native 1.2.11 installers from `77dcba4a`, whose product tree is
      byte-identical to the later green carrier. The later change is an E2E fixture only.

Real installed `927412a7` preset and Focus/Return checks captured 60 decoded return frames
per engine and visually verified intermediate native-picture movement and artwork/fade on
A and B before restoring preset 3. The retained evidence is recorded in
`seat-backup-local-playlist/tasks.md`; this does not prove content-clock synchronization.
