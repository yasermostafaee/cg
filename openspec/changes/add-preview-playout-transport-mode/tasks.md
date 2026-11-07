# Tasks — Preview playout transport mode (D-199)

## 1. Recon and design

- [x] 1.1 Register D-199 and pin the two mutually exclusive Preview meanings.
- [x] 1.2 Map current Preview loop/ping-pong/step controls and the existing lifecycle command seam.
- [x] 1.3 Record mode switching, Next availability and reset semantics in `design.md`.

## 2. Implementation

- [x] 2.1 Add the explicit Rehearse toggle and mutually exclusive control groups.
- [x] 2.2 Keep ordinary Play strictly linear and wire Play / Next / Stop only in playout mode.
- [x] 2.3 Preserve project state and reset preview-only state on switch/close.
- [x] 2.4 Make Stop cursor timing conditional on a real authored visual Outro, preserve a
      Sequence's current content while its post-Out keyframes close it, and give the folder-backed
      Quran Sequence a smooth authored close.

## 3. Verification

- [x] 3.1 Add deterministic component tests for visibility, disabled states and command routing.
- [x] 3.2 Add real-browser coverage for both transport modes. Local Chromium: 6/6 scenarios passed
      on 2026-11-07, including linear Play, short tooltips, hidden controls, disabled Next, real
      lifecycle Play / Next / Stop, a Sequence preserving its current page through the authored
      Outro, repeated Stop determinism and authoring-picture restore. Runtime split-exit unit suite:
      6/6 passed, including a text Sequence sampled at the midpoint of its exit.
- [ ] 3.3 Run Designer checks, strict OpenSpec validation and the full repository gate. Designer
      typecheck/lint/build and strict change validation pass. The full gate was attempted on
      2026-11-07 and is blocked by four pre-existing failures outside D-199: shared-schema lint,
      UI lint, Runtime lint and the reviewed-weather-header starter test.
