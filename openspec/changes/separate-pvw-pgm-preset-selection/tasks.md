## Implementation

- [x] Replace programme-following preview pins with independent per-row cues.
- [x] Share Inspector selection on/off air and seed PVW before programme changes.
- [x] Preserve cues across rehearsal toggles; prune through confirmed row lifecycle only.
- [x] Keep row preset buttons enabled off air and identify first/live PGM targets.
- [x] Cover Designer/New live layout parity and row Focus in DOM regressions.
- [x] Verify actual Bridge interleaving and stop/play/rehearsal transitions in Edge.
- [x] Update existing browser source-name/look regressions to choose PVW in the Inspector.

## Verification

- [x] 96 DOM/store tests; 13 real Edge cases; Runtime typecheck, build and changed-file lint.
- [ ] Integrated authoritative Linux gate and gate:e2e on the final release commit.

Changed-file lint has zero errors and retains the pre-existing unrelated non-null assertion
warning in the frame-draft merge path. No permission or command guard is relaxed.

The two-axis sweep checked 102 relevant renderer paths and 446 test paths, with 15 legacy
wording matches and 73 selection/picker component matches. Legacy dedicated-preview widget
coverage remains; product row controls now name their PGM target explicitly.
