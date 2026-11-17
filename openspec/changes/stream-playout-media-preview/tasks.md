# Tasks

## Implementation

- [x] Add typed media-open and media-close IPC and the optional Runtime Bridge methods.
- [x] Resolve verified A/B media targets with independent Engine authentication and channel scope.
- [x] Validate manifest media identity and exact resource paths before issuing scoped grants.
- [x] Stream GET, HEAD and byte ranges with backpressure, cancellation and response metadata.
- [x] Renew live grants and revoke them on expiry, close, logout, disconnect or authorization loss.
- [x] Render native media playback with local seek, Stop, optional listening and retained posters.
- [x] Preserve sampled playback for unsupported Bridge or Playout capabilities.

## Verification and release

- [x] Pass the 23 Bridge media-relay and HTTP-ticket tests and the 18 channel-fence tests.
- [x] Pass Bridge and Runtime typechecks and scoped lint.
- [x] Pass 7 Runtime DOM cases covering file playback and foreground cleanup.
- [x] Run a fresh Runtime build and pass 3 Windows Edge cases for native Range playback,
      legacy sampled controls and data-video PVW under the page CSP.
- [ ] Run the full local gate after integration with the current dev proof docs.
- [ ] Push normally and record the completed, green carrying Linux E2E job URL here.
- [ ] Build and verify the three local 1.2.11 installers from the verified source commit.
- [ ] Verify authenticated media previews on the target station with the updated Bridge and Control.
