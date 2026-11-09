# Tasks

- [x] 1.1 Add the D-173 PRD entry and validate this change strictly.
- [x] 1.2 Enlarge only the Preview dialog without changing other modal defaults.
- [x] 2.1 Reorder the workspace so status/transport is first and Variables is below controls.
- [x] 2.2 Remove the Preview Out action and reduce persistent explanatory copy.
- [x] 2.3 Add a monotonic elapsed display with Play/Pause/Resume/Stop/Reset/natural-completion states.
- [x] 3.1 Restyle scalar Variables as compact aligned rows while keeping rich list/repeater editors.
- [x] 3.2 Add focused DOM tests for order, size, transport and elapsed behaviour.
- [x] 3.3 Add/adjust Playwright coverage for the large Preview and dense variable workspace.
- [x] 3.4 Move enlarged frame/time status above the picture and give both counters stable widths.
- [x] 3.5 Match CG Control's automatic first-strong direction in Preview value editors.
- [x] 3.6 Reduce Advanced timing to compact state/control rows and increase editable-value contrast.
- [x] 3.7 Remove per-field/per-item Update controls; keep one in-place `Update all` action.
- [x] 3.8 Show the active composition name in the status strip above the picture.
- [x] 3.9 Separate minutes, seconds and hundredths consistently with colons.
- [x] 3.10 Shorten Preview command tooltips to compact actions or disabled-state reasons.
- [x] 3.11 Reset both counters on Stop while preserving Pause and natural-completion semantics.
- [x] 4.1 Run focused typecheck, lint and tests.
- [x] 4.2 Run `pnpm gate` before commit/push.

## Current Designer/gallery integration

Command order/layout, one Update all, unchanged held backgrounds, list updates, Stop-only transport and structured-row shared scrolling passed focused browser checks on the pre-integration gallery snapshot (2026-11-04).

Existing checked tasks are historical implementation/evidence records; no completed Linux E2E
is inferred from a checkbox without its carrying-commit run URL. The combined source still owes:

- [x] I.1 Complete this feature's reconciled-browser acceptance beyond the verified subset below.
- [x] I.1a Verify current command-first layout, composition/status above the picture, fixed-width
      counters, no Out action, elapsed Pause/completion and Stop reset. All eight
      `preview-workspace.spec.ts` cases pass within the current 28-case gallery/shell batch; they
      also cover a single selected Preset and static/empty authored clocks. The current readiness
      boundary has its separate passing browser and DOM evidence in R.4/R.5.
      A subsequent fresh-build ten-case batch passes in 23.0 seconds: `preview-field-update.spec.ts`
      (two), `preview-item-update.spec.ts` (two), `repeater-workspace.spec.ts` (two) and
      `canvas-lifecycle-playback.spec.ts` (four). Its Preview cases verify the single scalar/list
      Update all action, in-place updates preserving held backgrounds, expanded multiline input,
      and many-column rows sharing one labelled scroll viewport at 1200×850.
- [x] I.1b Verify the corrected Reset contract tracked separately in subsection Z. The new responsive
      case passes 1/1 in 5.9 seconds
      (case: 2.5 seconds) on the current build at 1024×768. It checks strict viewport/clipping-ancestor
      containment, visible controls, scalar Latin-to-Persian first-strong direction, actual field
      updates/rendered text, Pause-to-Resume elapsed advancement, Stop and Close. Its saved screenshot
      was visually reviewed. The subsequent field/item rerun passes 4/4 in 8.9 seconds, including
      multiline and list-item first-strong direction with leading neutral digits/punctuation and
      unchanged field values. An initial list fixture expected Latin digits despite the authored
      ticker's Persian-digit setting; using that authored digit form preserves the strict value and
      direction checks. Responsive, scalar/multiline/list direction and transport are now covered;
      actual Reset behavior is now verified by the fresh-build 16/16 Preview browser batch
      (39.0 seconds), including playing/paused/closing teardown, restored values, blank idle state
      and explicit replay. The same run re-verifies readiness, data updates and responsive behavior.
- [x] I.2 The full gate and [carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42568697446/job/129000870086)
      passed on `665668e4`, including the league row editor.
- [x] I.3 Align the league row-editor test with the authored `ردیف‌های جدول` label. The
      [previous Linux run](https://github.com/yasermostafaee/cg/actions/runs/42560037714/job/128974291509)
      found the obsolete selector after the owner revised the starter in `6ccd08b8`.

Integration scope and shared validation checklist: `../reconcile-current-designer-gallery/tasks.md`.

## Preview readiness follow-up — Full lane, 2026-11-04

- [x] R.1 Register the concrete early-command/elapsed race under existing D-173 and this change,
      without allocating a duplicate feature/bug ID. Static source review establishes the command
      loss window; the first capture's failure is consistent with it, not proven caused by it.
- [x] R.2 Disable transport until the current dedicated iframe signals ready and guard handlers so
      early commands neither dispatch nor advance elapsed time; do not add queued/automatic Play.
- [x] R.3 Reset readiness on content rebuild/reopen, retain current-frame source filtering and reject
      obsolete readiness without changing exported timing or ready-state transport semantics.
- [x] R.4 Add controlled delayed-ready, foreign/stale-ready, rebuild/reopen and elapsed-clock tests,
      including a normal successful Play after readiness and unchanged Pause/Stop completion behavior.
- [x] R.5 Verify the readiness boundary in a fresh real-browser run; capture retries alone do not count.
      Current focused DOM validation passes 23 tests across two files; Designer's two realms pass
      typecheck and build. The eight-case browser batch initially ended 7 passed / 1 failed because
      the readiness fixture located the iframe through a title attribute cleared by tooltip handling.
      The corrected stable locator is scoped to the Preview dialog's iframe, without weakening the
      readiness assertions. Its fresh browser rerun passes in 1.6 seconds on 2026-11-04.
- [ ] R.6 Run focused checks and final gate, then record completed green carrying-commit Linux E2E
      before closing the follow-up. No final gate, Linux or push success is inferred from earlier checks.

## Z. Reset ends the actual dedicated rehearsal — Full lane, 2026-11-04

- [x] Z.1 Register the concrete mismatch: host counters reset while iframe only updates fields/ticks,
      leaving actual lifecycle/drivers running. Preserve ordinary Stop and on-air semantics.
- [x] Z.2 Tear down the dedicated rehearsal immediately, restore idle/default state and preserve
      assets/session settings; prevent stale pending Play and keep explicit replay usable.
- [x] Z.3 Add generated-host regressions using the real runtime for playing/paused/outro Reset,
      default data, no old-driver continuation, command ordering and fresh replay.
      The typed optional Reset payload carries the exact host seed, including connected-file rows.
      Focused generated-host/readiness coverage passes 18 tests across two existing files; it pins
      duplicate Reset, Reset→Update→Play, Play awaiting a font, seeded Repeater rows, Canvas's
      unchanged behavior and current-generation error reporting. Browser/gate remain separate.
- [x] Z.4 Verify Reset through the actual Preview controls in a fresh browser build.
      Fresh Designer build succeeds; all 16 Preview/browser cases pass in 39.0 seconds.
      The new Reset case checks playing, paused and closing runs, detached old runtime DOM,
      matching seeded defaults in form/output, idle blank state and a normal explicit replay.
- [ ] Z.5 Run focused checks and the final gate; record carrying-commit Linux E2E evidence.
      Both Designer TypeScript realms and all 18 generated-host/readiness tests now pass after
      correcting required-field/font metadata in test fixtures. The 102/103-task gate attempt
      remains failed, not retroactively green; a complete corrected-tree gate is pending.
      The subsequent corrected-tree gate (`gate-20261104T190855Z-16092.log`) passes 103/103
      uncached tasks, formatting, control-byte checks and 141 OpenSpec items, exit 0 in 727.5 seconds.
      Only carrying-commit Linux evidence remains for Z.5; the earlier failed attempt stays recorded.
