## 1. Implementation

- [x] 1.1 Switch the row audio-button icon and accessible wording from `audioSummary`.
- [x] 1.2 Add distinct volume icons and audio state to each PVW plate's accessible name.
- [x] 1.3 Add DOM coverage for audible and muted rows/plates.

## 2. Verification

- [x] 2.1 Run focused Runtime DOM tests and Runtime typecheck.
- [x] 2.2 The full pre-push gate passed on `d6383de0`.

- [x] Verify the PVW toolbar and per-frame audio stay synchronized, authorized routed audio
      uses an audio-only preview lease, and Preview stop leaves programme audio untouched.
      Windows Edge exercises both NDI control surfaces. Unit tests cover explicit start,
      replacement, foreground loss and stalled PCM on a routed audition.
