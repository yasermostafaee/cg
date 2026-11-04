# Tasks: Current Designer/gallery integration

## 1. Scope and reconciliation

- [x] 1.1 Record the owner's request and isolated integration scope under D-179 without creating a
      duplicate PRD identifier.
- [x] 1.2 Reconcile all documentation conflicts, retaining current owner contracts and reviewed
      gallery/lifecycle behavior; distinguish source-snapshot evidence from integration evidence.
- [x] 1.3 Complete source/test conflict resolution and audit the selected browser/shared paths.
      No source conflict markers remain. Inventory: all 176 changed browser Designer paths and
      all selected required shared-package paths are present; the 11 omitted Designer paths are
      native/Tauri only. All 331 selected baseline paths exist in the integrated tree.
- [x] 1.4 Verify the original owner checkout and supplied projects remain unchanged by integration.
      Root independently compared all 331 baseline owner blobs on 2026-11-04; all hashes match.
      Original supplied project files were read only, never overwritten.
- [x] 1.5 Confirm native/installer and CG Control-only WIP were not included accidentally.
      No integration diff under Designer Tauri, Runtime, bridge-installer or release paths.
- [x] 1.6 Audit the pending commit scope without staging or editing configuration. At the recorded
      snapshot there are 363 pending paths: 307 selected-owner integration paths and 56 documented
      gallery, countdown, marker or Preview follow-up paths. All 331 selected owner baseline hashes
      still match. No excluded native, app Runtime, CG Control-only, installer, release or agent-config
      path is present; shared template-runtime is an intentional browser dependency. An explicit local
      path manifest records this snapshot, with the two expected replacement logo media paths listed
      separately. Recheck subsequent path additions before staging; this is not a gate approval.
      The later Reset/direction follow-up explicitly adds five reviewed paths: the typed
      PreviewFieldForm dispatch contract, generated-host control tests, scalar/list browser tests,
      and the existing blank-until-Play browser suite's actual Reset regression.
      With the two regenerated logo media paths the audited pending set is now 370, not 363.
      The original owner baseline hashes and both supplied project hashes still match; native,
      station-only and installer/config exclusions remain unchanged.

## 2. Validation

- [x] 2.1 Strictly validate the reconciled OpenSpec changes and format the touched documentation.
      All 141 items passed strict validation on 2026-11-04; no documentation conflict markers or
      duplicate Designer PRD identifiers remain. This is documentation evidence only.
- [x] 2.2 Run merged-tree typecheck, lint, unit tests and build; prior 103/103 results are not current.
      Current partial evidence: Designer unit suite passed 1958 tests across 216 files. This does
      not close the combined check or establish browser rendering correctness.
      The first integrated dependency/Designer build also passed all 14 tasks; final validation
      remains open for subsequent countdown/marker follow-ups and browser acceptance.
      After the second owner league adoption, the starter suite passes 55 tests and the starter plus
      Designer builds succeed. Final gate, remaining browser acceptance and gallery media are still open.
      Later current-source evidence: starter units pass 65 tests across five files; Preview readiness
      DOM tests pass 23 across two files; Designer's two realms pass typecheck and build. These focused
      results do not replace the final all-workspace gate. After the supplied logo revision, starter
      validation passes 68 tests across six files, including its three exact-preservation cases.
      The final fresh Designer build and seven-case Landing rerun pass (browser run: 34.3 seconds).
      The first final-gate attempt found three lint errors in the readiness test's empty observer
      stubs. Typed mocks replace them and focused lint passes; the all-workspace rerun remains open.
- [x] 2.3 Run real-browser current-shell acceptance: Landing import, Preview workspace, Variables,
      Presets, contextual Inspector help, New Project and affected media authoring flows.
      The six-suite gallery/shell batch passes 28 cases. The later five-case batch passes in 22.9
      seconds, including the previously pending Landing import and six-box public Looks presets,
      blank-before-Play behavior and two revised logo captures.
- [x] 2.4 Run real-browser gallery acceptance, including league/row effects, weather choices and
      single-pass completion, forecast alignment, persistent Azan announcement and gallery media.
      The recorded focused lifecycle/readiness runs, 28-case gallery/shell run and latest five-case
      batch cover these contracts, including decoding all twelve clips. The adopted logo poster
      and replacement motion were visually reviewed after regeneration; the final gate is separate.
- [x] 2.5 Rebuild the served local bundle, refresh Designer and verify the page is the integrated
      revision before asking the owner to review it.
      The live landing was safely refreshed on 2026-11-04 and verified to show twelve entries:
      both original weather starters plus the new city cards, without the rejected outlook.
      The supplied logo revision has since been built and its poster/motion regenerated and reviewed;
      the live Designer landing was refreshed and its twelve entries verified. The final build and
      seven-case landing rerun also passed; they do not provide final-gate or Linux evidence.
- [x] 2.6 Run the final repository gate for the carrying source snapshot.
      Corrected-tree gate `gate-20261104T190855Z-16092.log` completes with exit 0 in 727.5 seconds:
      103/103 uncached tasks, formatting, control-byte checks and all 141 strict OpenSpec items pass.
- [ ] 2.7 Record the completed green Linux E2E run URL for the final carrying commit.
- [x] 2.8 Include the stopped-Canvas expired-countdown regression and brighter five-threshold Azan
      revision in the final integrated browser check; earlier gallery captures do not verify them.
      Both direct/nested countdown cases and both current Azan cases pass in the controlled
      `workers=1` run below. Gallery media and the broader integrated suite remain separate debts.
- [x] 2.9 Include D-188's green Hold-start/Loop-range regression in the final integrated browser check.
      The later controlled loop-range suite passes 13 cases, including the colored-row contrast case.
- [x] 2.10 Verify twelve catalog entries after removing only the new outlook, keeping both originals
      plus new city cards and its eight-page/four-card cycle. Verify compact degrees in all three,
      retaining original four-page pagination and equal 52 px forecast type; recapture affected media.
      Both natural city cycles pass (original 32.6 seconds, new eight-page about one minute).
      Actual degree-glyph gaps are 0–8 px for 7, 23 and −7 in Canvas and Preview across all three.
      All three weather posters/motion clips were regenerated and visually reviewed; the current
      landing's twelve-entry inventory was also checked. Detailed media evidence is in gallery task 7.6.
- [x] 2.11 Verify D-173's current-iframe readiness boundary: no dropped early Play with advancing
      elapsed time, readiness reset on rebuild/reopen, and rejection of unrelated/stale ready messages.
      Readiness DOM checks pass 23 tests across two files. The fresh browser case passes in 1.6 seconds
      after replacing a title-based fixture locator with the stable Preview-dialog iframe locator.

Current interactive smoke evidence: the served New Project dialog exposes synchronized seconds,
frames and 30 fps. This narrow live check is not a substitute for the acceptance suite in 2.3.

## 3. Physical reboot and unfinished browser verification — 2026-11-04

The planned 36-case integrated browser run did not provide a completed green result before the
owner's computer hung and was rebooted. The surviving `.last-run.json` is `failed`, with two recorded
failures: the new Azan icon test expected a descendant image that was absent, and the nested expired-
countdown authoring test timed out waiting for Playback mode. These are real test failures requiring
triage, not automatically explained away by the reboot. The remaining batch status is unverified.

- [x] 3.1 Investigate the two saved browser failures and distinguish product defects from fixture errors.
      Azan's image locator has been corrected to match the actual image element itself and check
      positive intrinsic width, not an impossible descendant image.
      The nested-countdown fixture configured parent timing after adding a full-canvas child that
      intercepted its deselect click, leaving the element Inspector open. It now configures timing
      before inserting the child; expiry/editability assertions remain intact and no runtime change
      was needed. Both corrected cases subsequently pass in the controlled run recorded below.
- [x] 3.2 Re-run controlled, single-worker acceptance after the loop-contrast and second league-revision
      follow-ups, then collect current final-gate evidence.
- [x] 3.3 Complete final review and push only after the required local checks; Linux E2E remains owed
      until a completed green carrying-commit run is recorded. Commit `877da2c4` is pushed and the
      remote `dev` SHA is independently verified. Its pre-push gate
      `gate-20261104T192802Z-1232.log` finishes with exit 0, 103/103 uncached tasks and 141 strict
      OpenSpec items in 705.8 seconds. The live Designer landing displays this revision.
      [Carrying-commit CI](https://github.com/yasermostafaee/cg/actions/runs/41899115160) subsequently
      completed with successful Docs and full Lint/Typecheck/Test/Build jobs, but a failed actual
      Linux E2E step. The follow-up below records its triage. Desktop is deliberately skipped,
      not released.

The isolated worktree and edits survived. Designer's local service was restored after reboot;
service availability alone does not complete browser acceptance or final validation.

Controlled post-reboot browser evidence: `countdown-authoring.spec.ts`,
`starter-countdown-target.spec.ts` and `loop-range.spec.ts`, with `workers=1`, completed in 1.4 minutes:
**16 passed / 1 failed**. Both direct/nested expired-countdown cases pass. Both Azan cases pass,
covering all five stage colors, the loaded icon, the real zero announcement, persistent hold and
manual Stop/replay. The green Hold/blue playhead case passes. The colored-row contrast case fails
in fixture setup at `selectElementById(undefined)` on line 55. That run did not verify contrast.
After correcting the compact-zoom placement fixture, the later loop suite passes all 13 cases.
The current league behavior case also passes. Neither result is final-gate, Linux or push evidence.

Subsequent historical browser evidence includes an 18-passed / 1-failed batch: the degree fixture
selected zero-width content under a hidden ancestor. Effective ancestor visibility is now checked
before measurement. The latest eight-case batch then passed seven weather cases and failed only
the readiness fixture's title-based iframe lookup, because tooltip handling clears that attribute.
Its stable dialog-scoped replacement passes the unchanged readiness test in a fresh 1.6-second run.
The seven weather cases cover city-card choices/geometry/animated icons, both complete city cycles,
and compact degrees in all three retained weather templates. The subsequent six-suite all-gallery/
shell batch completes with all 28 cases passing, including actual decoding of all twelve gallery
clips. The subsequent five-case batch passes in 22.9 seconds, including Landing import, six-box public
Looks presets, blank-before-Play and both newly captured logo media cases. The supplied logo's exact
source preservation passes with the current 68-test starter suite; its poster and replacement clip
were visually reviewed. The final fresh build and seven-case landing rerun passed; the latter took
34.3 seconds. Current Azan/second-revision league posters and sampled frames from their final encoded
clips were visually reviewed; regenerated motion also has Preview-capture and browser decode/playback
evidence. Source-before-capture-before-encode ordering is recorded in gallery tasks 6.25/6.27.
The next fresh-build browser batch passes all ten cases in 23.0 seconds: scalar/list Update all
preserves held backgrounds, many-column rows share one scroll viewport, and Canvas lifecycle,
replay, stagger, Pause/resume and explicit Preview-loop behavior work through public controls.
The additional 1024×768 Preview case passes with strict dialog/iframe clipping-edge containment,
visible controls and actual data/transport interaction; its saved screenshot was visually reviewed.
The field/list rerun passes 4/4 in 8.9 seconds, including multiline/list first-strong direction.
This acceptance expansion exposed a real Reset mismatch: host counters reset while the iframe's
old lifecycle could continue. Its bounded dedicated-Preview correction is tracked under D-173
subsection Z; the final gate and current browser run must include that fix before completion.
The dedicated Preview correction is now implemented and independently reviewed. A fresh build
and 16-case Preview browser batch pass in 39.0 seconds, covering actual Reset teardown/defaults/
idle/replay plus readiness, responsive geometry, first-strong direction and data updates.
The generated-host/readiness focused run passes 18 tests; deferred-font cancellation also passes
its isolated rerun. This does not substitute for the complete repository gate or Linux evidence.

The first final gate (`gate-20261104T175900Z-13344.log`) exposed three lint errors in the readiness
test's empty ResizeObserver methods. After replacing them with typed mocks and passing focused lint,
the already-failed gate's remaining child tasks were deliberately stopped; its footer records exit 1
after 1279.7 seconds. The lock wrapper exited normally; live Designer/fake-station services were not
stopped. A fresh complete gate is required; no final-gate, Linux or push result is implied.

The next complete attempt (`gate-20261104T184639Z-18056.log`) finishes with 102/103 tasks passing,
exit 2 after 1237.5 seconds. Designer typecheck catches a missing `required` property in the new
Reset fixture; its second TypeScript realm then exposes the same omission in two generated-host
fixtures and incorrectly shaped font metadata. All fixture definitions are corrected without
changing product behavior. Both Designer TypeScript realms now pass and the 18-test host/readiness
rerun passes in 12.91 seconds. A new full gate is still required, not inferred from these checks.

The preceding remote baseline's three actual E2E failures were traced to already-corrected stale
expectations. Fresh current-build checks now pass: the two Designer cases (all selected plates must
be unlocked before Scale, numeric fields reject letters) in 7.3 seconds, plus both CG Control
File-only/active-number-surface cases in 6.5 seconds. This is local evidence; the next carrying
commit still needs its own completed green Linux E2E run.

Final corrected-tree local evidence: `gate-20261104T190855Z-16092.log` ends with exit 0 after
727.5 seconds on 2026-11-04. All 103 tasks run uncached and pass; Designer passes 1973 tests in
217 files, Runtime 2532 tests and Bridge 1961 tests. Formatting, the 4508-text-file control-byte
scan and all 141 strict OpenSpec items pass. This is local validation, not a push or Linux discharge.

Owner sequencing: continue the remaining verification, then address the forthcoming Repeater reports
before preparing installers. No installer build has been requested for this intermediate snapshot.

D-186 Follow-media Freeze parity is a separate follow-up under
`../align-follow-media-cursor-and-freeze-frame/tasks.md`, begun after the verified integration push.
Commit `877da2c4` does not contain that correction or discharge its verification.

## 4. Whole-suite Linux follow-up

The completed run above is not green evidence: Designer reports 12 failed, 1 flaky, 262 passed,
13 skipped and 142 unrun; CG Control reports 6 failed, 349 passed, 2 skipped and 31 unrun.
Both suites also hit their existing global run/teardown budgets. These deadlines are not separate
product crashes and do not authorize increasing timeouts or weakening assertions.

- [x] 4.1 Reconcile proven stale browser expectations with the accepted compact toolbar,
      composition-owned Hold, collapsed Preview Advanced controls and Persian-only starter names.
      Preserve actual mixed-script glyph geometry with an explicitly mixed-script fixture.
- [x] 4.2 Diagnose both pixel cases independently. The Alt-drag fixture assumes its fixed CSS delta
      cannot produce a whole scene-pixel delta, but at the measured 825% zoom 33 CSS pixels equal
      exactly four scene pixels. Its replacement uses measured scale and checks the actual free
      delta as well as non-integer placement. Pixel-paint's second zoom pass overwrote the previous
      margin while calculating its correction from the already-offset stage. It now adds the
      correction and chooses the closest measured neighboring LayoutUnit at deep-scroll coordinates,
      where DOMRect precision is coarser than the local margin lattice. Strict achieved-phase checks
      are added; original paint, crispness and gizmo tolerances remain unchanged. No product change.
- [x] 4.3 Complete P-076's canonical labelled Version/Revision/Build-date contract. The imported
      shared formatter omitted Revision despite the still-active PRD/OpenSpec requirement; update
      the formatter and both products' tests, not the requirement to match the incomplete source.
- [ ] 4.4 Run focused real-browser regressions, final local gate and separate push, then record
      a completed green carrying-commit Linux E2E result. Installers remain deferred.

Follow-up local evidence (2026-11-05): all four build-identity unit cases and the fresh 18-task
Designer/CG Control dependency build pass. The first 63-case Designer browser batch passes 59;
three failures expose the new phase precondition's single-correction precision assumption, and
the fourth finds a second video-rebuild case still addressing a collapsed Advanced control.
After the bounded fixture corrections, all nine pixel-paint/video-rebuild cases pass in 42.0 seconds,
including DPR 1, 1.25 and 2. The separate Alt-drag case and all eight pixel-snap cases pass.
No timeout, image tolerance, rendered behavior or production refusal was weakened.
B360 now polls the actual iframe's swapped frame order before retaining its exact geometry checks;
the full Live Source suite passes. The mixed-name fixture uses the imported filename, respecting
R-004's filename-before-manifest naming contract; its initial manifest-only spelling was rejected
by the test itself. The corrected six-suite Runtime batch passes **20/20 in 52.7 seconds**, including
the mixed glyph geometry, a real Designer-exported book round-trip, plate audio/ownership and the
labelled startup identity. Both Designer TypeScript realms, Runtime and splash-kit typechecks pass;
splash-kit lint also passes. A complete corrected-tree rerun of the twelve Designer suites passes
**63/63 in 2.1 minutes**, without retries, including every pixel and video sibling. Both app lints
pass with existing warnings only; both active follow-up changes pass strict OpenSpec validation.
The final full gate and carrying-commit Linux run remain separate.
