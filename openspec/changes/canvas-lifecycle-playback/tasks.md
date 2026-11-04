# Tasks

- [x] 1.1 Register D-175 in the Designer PRD.
- [x] 1.2 Reproduce and isolate the canvas scrub-only playback path.
- [x] 1.3 Add and strictly validate this OpenSpec change.
- [x] 1.4 Register B-380 and extend this change with the empty/static Canvas cursor contract.
- [x] 1.5 Register B-382 and extend the contract to empty/static Preview parity.
- [x] 2.1 Add session state that distinguishes lifecycle playback from playhead-only playback.
- [x] 2.2 Route ordinary canvas Play/Pause/Resume through the runtime controls.
- [x] 2.3 Reflect root runtime frames and natural completion into the transport without scrub feedback.
- [x] 2.4 Preserve reverse, Preview loop, ping-pong, manual scrub and sound audition behaviour.
- [x] 2.5 Keep an active canvas lifecycle coherent across authoring scene rebuilds.
- [x] 2.6 Add an authored display clock for empty/static roots without changing Runtime paint or
      lifecycle ownership.
- [x] 2.7 Keep collapsed root-frame boundaries from overwriting that clock and preserve fresh Play,
      Pause and Resume semantics.
- [x] 2.8 Share the authored lifecycle projection with Preview and defer collapsed finite stops.
- [x] 3.1 Cover intro / hold / outro parity and replay after natural completion.
- [x] 3.2 Cover finite ticker-driven completion on the main canvas.
- [x] 3.3 Cover explicit playhead-only loop / reverse behaviour.
- [x] 3.4 Cover a truly empty composition, an intermediate Canvas frame, Pause/Resume and fresh
      replay; retain the static-Rectangle parity case.
- [x] 3.5 Compare truly empty Canvas and Preview semantics for Static, Freeze, Middle loop and
      finite Auto-out, including Stop and fresh replay.
- [x] 4.1 Run focused typecheck, lint and tests.
- [x] 4.2 Run `pnpm gate`.
- [x] 4.3 Run focused Designer typecheck, lint, DOM and browser tests for B-380.
- [x] 4.4 Run `pnpm gate` and read the step-level E2E discharge.
- [x] 4.5 Re-run focused checks, strict OpenSpec validation and the full gate for B-382.

## Current Designer/gallery integration

Ordinary Canvas lifecycle, finite ticker completion/re-arm, Pause/Resume, explicit playhead-only Preview loop, empty-scene replay and real staggered Repeater row poses passed focused browser checks on the pre-integration gallery snapshot (2026-11-04).

Existing checked tasks are historical implementation/evidence records; no completed Linux E2E
is inferred from a checkbox without its carrying-commit run URL. The combined source still owes:

- [ ] I.1 Complete reconciled-browser Canvas lifecycle acceptance beyond the verified subset below.
- [x] I.1a Verify real Canvas Middle-loop root-cursor wrapping and native Freeze paint/cursor parity
      with Preview through the current passing 13-case `loop-range.spec.ts` suite. Both passing
      `countdown-authoring.spec.ts` cases also verify direct/nested live expiry during Canvas Play
      and restored editable content after returning to authoring, without changing saved targets.
      The later fresh Designer build and ten-case browser batch pass in 23.0 seconds. Its four
      `canvas-lifecycle-playback.spec.ts` cases verify a truly empty cursor's advance/Pause/Resume/
      replay, finite ticker completion/re-arm, explicit playhead-only Preview loop, and lifecycle
      Pause/Resume. The two `repeater-workspace.spec.ts` cases include real staggered Canvas entrance,
      a frozen paused row pose and continuation of the same run. Four scalar/list update cases also
      pass in that batch; they are not additional Canvas-mode coverage.
- [ ] I.1b Verify remaining merged-browser Canvas scenarios: empty/static parity across the untested
      hold/mode combinations, Repeater exit/fresh replay, scene-rebuild continuity and explicit
      reverse/ping-pong/media-seek behavior. The passing Preview projections and narrowed Canvas
      cases do not verify this full matrix; earlier pre-integration passes remain historical only.
- [ ] I.2 Run the final merged-tree gate and record completed Linux E2E evidence for its carrying commit.

Integration scope and shared validation checklist: `../reconcile-current-designer-gallery/tasks.md`.
