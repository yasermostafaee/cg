# Tasks

## Implementation

- [x] Add optional frame, audio, listen-lease and poster engine metadata to shared IPC.
- [x] Resolve per-source A/B preview reads using independent channel, D10 and D11 identities.
- [x] Partition snapshot/PVW/audio requests and keep each engine's leases and bearer budget separate.
- [x] Route live listening to the same independently resolved source and engine.
- [x] Fence asynchronous live-check and PVW preparation by the latest exact operator intent.
- [x] Keep unavailable/departed A read eligibility separate from programme seating eligibility.
- [x] Add fingerprint-verified native media and poster fallback without programme commands.
- [x] Preserve availability colors and emphasize only the decoded picture's existing A/B badge border.

## Verification

- [x] Pass all 63 bounded Bridge source/audio/media/presence, channel-fence and delayed-intent tests.
- [x] Pass all 498 shared-IPC tests, including separate preview, binding and seating eligibility.
- [x] Add 7 delayed-preparation regressions for replacement, cancellation, cleanup and passive polling.
- [x] Prove B-only input reads with both A and B active, mixed-engine PVW, B-owned listen/audio,
      and media/poster fallback with A missing or offline.
- [x] Pass final Bridge and Runtime typechecks, scoped lint and 59 renderer DOM cases after freeze.
- [x] Pass 2 fresh Windows Edge cases for decoded A/B provenance and native Range media playback,
      including local audio and transport controls. The existing badge border is the only emphasis.
- [ ] Integrate with the release fixes, pass the full local gate and push normally.
- [ ] Record the carrying commit's actual completed green Linux E2E URL and build installers.
- [ ] Verify the updated Bridge/Control previews on the target A/B station.
