# Tasks

## Implementation

- [x] Add the unavailable-only optional handoff hint to shared IPC.
- [x] Verify same-fingerprint A/B handoff proof and bound its owner-scoped lifetime.
- [x] Probe held leases and allow one fresh acquisition only for a verified hint.
- [x] Preserve local position, Play/Pause and listening while fencing cancelled replies.
- [x] Keep codec, authorization and fingerprint failures terminal.

## Verification

- [x] Reproduce the missing UI recovery with failing handoff regressions before the change.
- [x] Pass focused Bridge/IPC regressions and 25 renderer cases, typechecks and scoped lint.
- [x] Pass a fresh browser Range-playback check through B/A/B handoffs, plus provider-border checks.
- [x] Integrate and run the normal full release verification: 103/103 local gate tasks,
      normal push and completed green carrying [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      on `261b57c8ae1840e96a3d10d6540c3094ad529239`. Runtime passed 486/2 skipped;
      Designer passed 460 plus 1 flaky passing its configured retry/15 skipped; pack passed 2.
      All three 1.2.11 native installers were verified from `77dcba4a`, whose product tree
      is byte-identical to the green carrier; only the later E2E fixture differs.
- [ ] Verify recovery against the authenticated A/B station after installation.
- [x] Verify the real authenticated APIs separately through an isolated backend/browser:
      continuous A/B/A media ownership, `target-changed` on each superseded lease, decoded
      4K video/audio, no decoder error and playback positions 12.50/15.54/18.44 seconds.
      The report `real-api-continuous-role-report.json` records success and restoration to A.
      This does not replace the pending installed-Bridge acceptance above.
