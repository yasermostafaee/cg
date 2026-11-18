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
- [x] Run the full local gate after integration with the current dev proof docs: 103/103
      tasks, including Runtime 2760, Designer 2026 and Bridge 2286 tests, on `261b57c8`.
- [x] Push normally and record the completed green carrying [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      on `261b57c8ae1840e96a3d10d6540c3094ad529239`: Runtime 486 passed/2 skipped;
      Designer 460 passed, 1 flaky passing its configured retry, 15 skipped; pack 2 passed.
- [x] Build and verify the three local 1.2.11 installers from native source `77dcba4a`.
      The user authorized this candidate before Linux completion. The later green carrier
      changes only an E2E fixture; the complete product/configuration/assets tree is identical.
      Native versions, packaged content, icons, two-page guide and SHA-256 manifest passed,
      including a second manifest verification after the authorized Share copy.
- [x] Verify authenticated media previews in installed Control `b7d3cf1b` with updated Bridges:
      the native 4K file player advanced 3840x2160 video/audio on A, B and A return. A ready
      proxy independently advanced 640x360 video/audio through A/B/A with correct providers,
      no decoder error and final role A. Evidence is retained in
      `installers/1.2.11/evidence-b7d3cf1b/installed-acceptance.json` and
      `ready-proxy-acceptance.json`, with actual UI PNGs. This is scoped acceptance: Mountains
      proxy B returned upstream `mediaPreview.proxyTooLarge`, while A later returned
      `mediaPreview.preparationTimedOut` at 04:44:21.965291Z;
      B passive Playlist/NDI permissions and exact PGM clock equality are not accepted here.
- [x] An isolated backend using the real authenticated A/B station APIs passed a continuous
      A/B/A ownership transfer with decoded 3840x2160 media and audio, retaining position and
      playback. Evidence: `real-api-continuous-role-report.json` (2026-11-18). This is a
      separate harness, not acceptance of updated Bridges installed on the two servers.
