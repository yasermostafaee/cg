## Implementation

- [x] Independently qualify alternate picture reads after a valid no-picture observation.
- [x] Preserve PVW union leases and normal thumbnail/media-position budgets.
- [x] Preserve owner cleanup, authorization and actual picture provenance.

## Validation

- [x] Real two-node source/bearer isolation and fallback regressions.
- [x] Existing authenticated Bridge preview compatibility checks.
- [x] Final targeted checks and strict OpenSpec validation (25 targeted tests including delayed selector/media-ID rebinding, existing 5-test authenticated preview compatibility suite, Bridge typecheck and scoped lint).

- [x] Integrated local gate and normal push passed on `261b57c8`: 103/103 tasks,
      Runtime 2760, Designer 2026, Bridge 2286 and 220 strict OpenSpec checks.
- [x] The actual carrying [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      completed green on `261b57c8ae1840e96a3d10d6540c3094ad529239`: Runtime 486 passed/2 skipped,
      Designer 460 passed plus 1 flaky passing its configured retry/15 skipped, pack 2 passed.
- [x] Verify all three native 1.2.11 installers from `77dcba4a`, with manifest read-back
      after the authorized Share copy. Its product tree is identical to the later green
      carrier, which changes only an E2E fixture. Early packaging was authorized by the user.
- [ ] Verify the updated Bridge/Control fallback on the authenticated target A/B station.
- [x] The separate real-API harness recorded an actual Playlist picture from A while
      ownership was B, with provider A truthfully reported; the native media lease used B.
      Evidence: `real-api-continuous-role-report.json`. Updated installed-Bridge acceptance
      remains separate and pending.
