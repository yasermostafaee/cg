# D-151 — the add-time duration guard, with the owner's settled third choice

## Why

The operator's own case: a 3 s scene, a 15 s video. Today the video is added silently and is
simply truncated by the host — the authoring surface gives no signal at the one moment the
mismatch is both knowable and trivially fixable, and the operator discovers it later in the
preview or, worse, on air. Cinegy asks at add time; so should we. The item's ⚠ open question was
settled by the owner (2026-08-12, recorded by session S): **sharpened Candidate A** — the third
choice is "Add as backdrop — follow the composition", which CONFIGURES the deliberate
looping-backdrop pattern (`phases.source: 'composition'`, the `media-phases-follow-composition`
mode) instead of dismissing a warning.

## What changes

- At ADD-TO-SCENE time (never asset import), content whose intrinsic duration exceeds the host's
  raises ONE dialog naming both durations, with the settled choice split:
  - **media (video / Lottie)** — three choices: _Extend the composition_ (host grows to exactly
    fit, ceil to whole frames, extend + add as ONE undo step), _Add as backdrop — follow the
    composition_ (`phases.source: 'composition'`, host untouched, `holdAt` tuned later in the
    Inspector), _Cancel_ (nothing added, scene byte-identical).
  - **composition-into-composition** — two choices: an instance has no `phases` and cannot
    follow, so the dialog is the firm Extend / Cancel form.
- A fitting add stays silent and identical to today.
- The guard sits at ONE chokepoint every add door passes through (doors mapped in design.md);
  duplicate/paste of already-accepted content is explicitly OUT of scope.

## Impact

- `apps/designer` — the guard module + dialog (shared `Modal` pattern), the add doors re-pointed
  at the chokepoint, tests (unit + E2E).
- Spec delta: `designer-video-element` (the add-time guard requirement covers all three content
  kinds; it lives with the video capability whose D-128 import/place flow is the primary door,
  cross-referencing the Lottie and compositions capabilities).
- PRD: D-151 → `[~]` with this change dir. No item number minted.
