# Tasks — simplify-media-timing-authoring

## 1. Product contract

- [x] 1.1 Preserve existing manual/marker projects; remove only creation of guessed manual phases.
- [x] 1.2 Define composition-owned Hold behaviour under Follow and classify seam copy as information.
- [x] 1.3 Link PRD D-176 to this change.
- [x] 1.4 Define the composition-owned Follow mapping: Freeze at composition Out point or loop the
      Middle range until composition Outro, with a read-only time-and-frame hold readout.

## 2. Inspector

- [x] 2.1 Remove **Add phase marks/markers** from phase-less Video and Lottie states.
- [x] 2.2 Keep **Follow composition** as the single phase-authoring action and update contextual copy.
- [x] 2.3 Remove media-level On hold authoring; Follow SHALL NOT read media markers/manual phases to
      choose composition Freeze or the Middle range.
- [x] 2.4 Render the accepted hold-to-outro seam as neutral information while preserving red warning
      treatment for corrective timing states.
- [ ] 2.5 Show a Video/PNG-sequence hold as read-only clip time and conformed-frame number.
- [ ] 2.6 Apply the same Freeze/Loop-middle choice in Designer preview and exported runtime for Video,
      imported PNG sequences and Lottie.
- [ ] 2.7 Remove editable Set hold time/frame and Freeze-frame overrides from Follow; keep the
      Out-point-derived hold read-only.
- [x] 2.8 Remove duplicate media-level **On hold** and **drives hold** selectors; composition
      Playback remains their single authoring surface.
- [x] 2.9 Keep **Detach** available before lifecycle anchors exist; source-only Follow SHALL return
      to no phase mapping without guessed values, while ignored authored values return as manual.

## 3. Verification

- [ ] 3.1 Update DOM/unit tests for the single Follow path, legacy manual compatibility,
      composition-owned Hold, middle-loop playback, hold-frame readout and warning/information
      distinction.
- [x] 3.2 `pnpm openspec validate simplify-media-timing-authoring --strict` passes.
- [ ] 3.3 Relevant package typechecks/lints and targeted unit/DOM/runtime tests pass.
- [ ] 3.4 Browser E2E covers marker-less Lottie, authored-idle Lottie and phase-less Video including
      the effective middle-loop and hold-frame surface (Chromium, Windows).
- [ ] 3.5 Full repository gate passes.
