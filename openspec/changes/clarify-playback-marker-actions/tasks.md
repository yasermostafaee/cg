# Tasks

- [x] 1.1 Register D-188 and compare marker terminology with official motion/video tools.
- [x] 2.1 Rename the visible phase rows and add equal-size Set/Clear actions with concise timeline
      tooltips.
- [x] 2.2 Preserve complete accessible names, fixed Info alignment and the stored field shape.
- [x] 2.3 Seed newly-set Hold start one frame earlier and make crossing marker drags symmetric without
      enforcing a permanent gap.
- [x] 2.4 Keep coincident authored boundary lines separately visible without changing stored frames.
- [x] 3.1 Cover all four marker states, the default gap and both crossing directions in deterministic
      and narrow-Inspector browser tests, including coincident-line browser geometry.
- [x] 4.1 Run focused validation, strict OpenSpec validation and the full repository gate.

## 5. Green Hold marker/range — 2026-11-04 visual follow-up

Earlier checks above describe the pre-integration source snapshot, not this new visual delta.

- [x] 5.1 Register the Fast-lane color-only correction under D-188 without changing timing behavior.
- [x] 5.2 Reuse semantic green for the Hold-start token and range surface; retain blue playhead and
      orange Outro start. Focused validation: 28 tests plus touched lint/format passed.
- [x] 5.3 Add the real-browser green-Hold/blue-playhead regression and perform the two-axis wording
      and token sweep (308/350/333/1553 tracked paths checked; retired color/copy had no remaining hits).
- [x] 5.4 Run the green-Hold/blue-playhead browser regression against the rebuilt integrated Designer.
      The controlled `workers=1` run on 2026-11-04 passes this case. This does not close the separate
      colored-row contrast scenario in 5.6.
- [ ] 5.5 Include the delta in the final batch gate and record the completed green Linux E2E URL.
- [x] 5.6 Strengthen range visibility over colored rows with a restrained plain fill, without
      diagonal hatching, thick halos, replacement layer colors or changed pointer ownership. Keep
      green Hold/orange Outro lines uncovered; verify the final painted result in the browser.
      The earlier controlled three-file run ended 16 passed / 1 failed in 1.4 minutes. The colored-row
      case failed at `selectElementById(undefined)` (test line 55), before validating contrast;
      the third rectangle placement had hit the selected rectangle's resize handle at compact zoom.
      The fixture now deselects first, waits for the exact row count and explicitly rejects a missing
      element ID. Contrast assertions remain unchanged. The subsequent controlled loop-range suite
      passes all 13 cases, including the final colored-row painted result, on 2026-11-04.
