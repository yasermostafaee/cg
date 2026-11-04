# Tasks

- [x] 1.1 Add D-182 to the Designer PRD.
- [x] 1.2 Add and strictly validate this OpenSpec change.
- [x] 2.1 Expose the root runtime's applied frame through an optional read-only observer.
- [x] 2.2 Forward deduplicated root-frame reports from the Preview iframe to its owning modal.
- [x] 2.3 Render current/total frame status beside elapsed time and reset it with a fresh run.
- [x] 3.1 Cover advance, hold, outro, loop wrap and nested-scope isolation.
- [x] 3.2 Add focused Designer DOM/E2E coverage for the frame readout.
- [x] 3.3 Cover the complete mode/hold matrix, collapsed static legs, hold-repaint isolation,
      pause/resume and open-ended elapsed timing.
- [x] 3.4 Give empty and static-only compositions an authored display clock and visibly reset both
      counters on every fresh Preview Play.
- [x] 4.1 Run focused typecheck, lint and tests.
- [x] 4.2 Run `pnpm gate` before commit/push.

## Current Designer/gallery integration

Runtime frame reports, elapsed Pause/Resume, natural completion, fresh Replay/reset and finite empty/static projection passed focused browser checks on the pre-integration gallery snapshot (2026-11-04).

Existing checked tasks are historical implementation/evidence records; no completed Linux E2E
is inferred from a checkbox without its carrying-commit run URL. The combined source still owes:

- [ ] I.1 Complete reconciled-browser runtime-frame coverage beyond the verified subset below.
- [x] I.1a Verify animated frame advance/status updates, elapsed Pause, static Replay/Stop reset,
      and truly empty Static, manual Freeze, manual Middle-loop and timed Auto-out projection.
      These are covered by the eight passing `preview-workspace.spec.ts` cases in the current
      28-case batch. The passing 13-case `loop-range.spec.ts` suite additionally covers native
      Freeze's painted-frame/cursor parity and draining Middle before automatic Outro.
      The later fresh-build ten-case batch passes in 23.0 seconds, including four
      `canvas-lifecycle-playback.spec.ts` cases. It confirms a truly empty Canvas cursor advances,
      pauses/resumes and resets on replay; this supplements but does not replace the existing
      Preview-frame evidence or verify independent nested-frame isolation.
- [ ] I.1b Verify remaining merged-browser isolation/mode scenarios: independent nested-frame and
      content-repaint isolation, non-empty visually collapsed legs, loop-cycle/mode combinations
      outside the tested empty projection, and Preview Pause/Resume across lifecycle phases. The recorded
      focused runs do not constitute the complete mode/hold matrix.
- [ ] I.2 Run the final merged-tree gate and record completed Linux E2E evidence for its carrying commit.

Integration scope and shared validation checklist: `../reconcile-current-designer-gallery/tasks.md`.
