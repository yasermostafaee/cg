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
- [ ] Integrate and run the normal full release verification.
- [ ] Verify recovery against the authenticated A/B station after installation.
