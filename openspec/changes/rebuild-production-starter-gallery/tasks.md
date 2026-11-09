# Tasks — production starter gallery (D-179, owner re-review)

Sections 1–6 record the eleven-entry gallery and its named follow-ups. Section 7 now tracks the
city-card addition and shared degree repair for a twelve-entry catalog. The attempted new outlook
has been rejected by the owner. Earlier all-gallery counts describe their recorded snapshots, not
verification of the current additions/removal or degree repair.

## 1. Contract and audit

- [x] 1.1 Register D-179 and the Persian-only starter list, excluding the English league example.
- [x] 1.2 Audit the five existing starters for current schema, lifecycle, binding and visual regressions.

## 2. Data-rich starters

- [x] 2.1 Add the one-page Persian Iran Premier League table.
- [x] 2.2 Add the multi-page Iran province-capital weather Sequence + Repeater example.
- [x] 2.3 Add the one-page today-and-next-days weather forecast without requiring Sequence.

## 3. Capability starters

- [x] 3.1 Add the folder-backed image Sequence example.
- [x] 3.2 Add the target-time Countdown with remaining-time Steps and conditional treatment.
- [x] 3.3 Add the polished multibox example.

## 4. Gallery and verification

- [x] 4.1 Register the new Persian starters with clear landing-card copy and stable order.
- [x] 4.2 Generate a real poster for every new starter and visually inspect desktop and card-sized output.
- [x] 4.3 Add focused schema/feature/default/catalog tests and run package build/typecheck/tests.
- [x] 4.4 Run Designer smoke coverage, strict OpenSpec validation and the full repository gate before push.

## 5. Owner re-review corrections

- [x] 5.1 Replace the Azadegan sample with the Iran Premier League; keep Persian labels/digits and
      remove the unnecessary update-date line.
- [x] 5.2 Rebuild province-capital weather so one weather-type choice field drives a value rule that
      swaps a consistent, attractive animated icon pack automatically.
- [x] 5.3 Replace the folder Sequence's placeholder SVGs with several high-quality full-frame Quran
      page images, make page advance manual by default, and verify operator page turning.
- [x] 5.4 Rebuild the multibox with real Looks: full-screen one-plate, larger two/four-plate presets,
      and a two-above-one three-plate preset. Remove independent per-input captions and backgrounds.
- [x] 5.5 Repair the nested ticker composition so its crawl text measures and renders once rather
      than overlapping when the on-air composition instances it.
- [x] 5.6 Audit starter lifecycle markers so every loop/hold visualization is internally consistent;
      no dotted start may imply a missing Hold start.
- [ ] 5.7 Regenerate posters, visually inspect every old and new Persian starter in Designer and
      Preview, and rerun focused package plus full-repository verification.
      All eleven posters were regenerated and visually reviewed on 2026-11-04. This caught and
      fixed absolute-position reveal tracks (countdown, weather and league headers); affected
      renders were regenerated again. Full-repository gate and Linux evidence remain separate debt.
- [x] 5.8 Remove redundant on-air wrapper compositions from full-screen starters (league, weather,
      Quran pages and multibox); keep wrapper compositions only where a small overlay such as a logo
      or ticker needs a separate on-air placement.
- [x] 5.9 Replace fictional vector network marks with the official APASAI image asset while keeping
      animation on the image element so an operator can replace only the asset.
- [x] 5.10 Add APASAI logo/name/link branding to the Designer landing and Help/About surfaces and to
      an appropriate persistent CG Control surface.
- [x] 5.11 Regenerate lazy, silent, smooth 30 fps WebM excerpts at a modest 1.15× rate for all eleven checkpoint gallery cards; play on hover or
      keyboard focus, reset to the poster on leave, and respect reduced-motion preferences.
      Superseded capture evidence: eleven 640×360 VP9 clips at 12 fps were 6.083–6.583 s each,
      395,978 bytes total, largest 75,344 bytes (existing 100 KB/card ceiling unchanged).
      Fresh-build browser hover/playback-rate/mute/reset checks and motion preference unit checks pass.
      Current replacement: eleven 640×360 VP9 clips, 30 fps at encoded 1.15×, 5.30–5.83 s,
      852,559 bytes total, largest 142,429 bytes. The cap is deliberately raised to 180 KB/card
      for real motion density and legible text, rather than retaining sparse frames or damaging
      quality. Chromium screencast captured 202–428 actual painted frames per clip, median
      intervals 13.33–13.36 ms. The first 45 decoded frames contain 26–45 distinct pictures;
      this is not a nominal frame-rate increase by duplicating the old 12 fps sources.
      Real Chrome playback exposed a decoder error in inherited JPEG full-range bt470bg output;
      converting to limited-range BT.709 fixed it. The generator documents the exact Profile 0
      yuv420p encoder/filter flags, and hover tests now require actual progress plus no media error.
      Final fresh-build landing suite: 7/7 browser cases pass. An additional all-eleven playback
      audit records 672 decoded frames, 3 dropped during the first clip's startup and zero dropped
      in the other ten clips (under 0.5% overall), with no media decode errors. The asset-budget
      and hover/reduced-motion unit checks pass 5/5; strict OpenSpec validation passes.
      Later twelve-entry integration evidence: the current 28-case gallery/shell browser batch
      passes, including actual decoding of all twelve clips. The newly supplied logo refinement
      has its completed replacement capture and local validation recorded in section 9.

## 6. Owner re-review: visible authoring contracts

- [x] 6.1 Replace finite keyframed weather glyphs with one licensed, coherently styled continuously
      animated SVG family; bind the condition text to an editable Choice list and use inspectable
      image-swap Value rules. Remove the forecast percentage.
- [x] 6.2 Add normal text Choice-list authoring and preserve the options/default on metadata edits.
- [x] 6.3 Remove the white APASAI tile and separate logo backplates, retaining image animation.
- [x] 6.4 Make rank derived/noneditable, uniform rank/points styling, subtle zebra rows and club crests.
- [x] 6.5 Replace Quran assets with five full-HD wide ornamental title/verse slides with Persian
      translation, following the latest owner examples (supersedes two-page spreads); keep manual advance.
- [x] 6.6 Remap starter image rules, Repeater rows and Sequence composition values during asset import.
- [x] 6.7 Run focused starter schema/render tests (44) and Designer metadata/asset rewrite tests (39).
- [ ] 6.8 Run the new authoring-contract browser scenarios, visually review the refreshed gallery,
      and run the final full gate. Linux E2E discharge remains owed until completed CI is cited.
      Browser weather-choice/rule and automatic-rank scenarios passed. Final 14-case smoke also
      passed normal-speed hover, Preview telemetry, shared row scrolling, Canvas stagger/pause,
      and countdown date picker/non-overlap/zero fade. Full gate and Linux discharge remain owed.
- [x] 6.9 Refine forecast temperatures following the owner's weather references: equally sized daily
      maximum/minimum, separate degree marks and readable Persian labels, without solid temperature
      tiles. The latest equal-size correction supersedes the initial unequal hierarchy and its capture.
- [x] 6.10 Refine league containment/palette, explicit top-to-bottom entrance and reverse exit order,
      with ordinary background opacity keyframes and adequate authored timeline length.
- [x] 6.11 Remove weather page-number graphics and author one complete automatic pass followed by
      content-driven overall exit, preserving all thirty-one cities and the last page's full dwell.
- [ ] 6.12 Regenerate league/city-weather/forecast posters and motion excerpts, verify actual browser
      row ordering, final-row containment, final-page dwell/close and equal forecast type, then rerun
      the final gate. Prior captures do not verify these latest corrections.
      Earlier three posters and normal-speed clips were regenerated and visually reviewed. Fresh-build
      browser run passed 14 cases, including all 18 league rows inside the panel, first-to-last
      entrance, last-to-first exit and background fade afterwards. The natural 32.7-second weather
      run showed all 31 cities once, kept the final page visible for at least six seconds, faded the
      overall background only after its rows exited and never re-showed the completed page.
      Forecast verifies equal-size values with separate labels. The league hover excerpt invokes
      normal Stop after the settled build to demonstrate its complete exit; task 5.11 records
      the later 1.15× recapture that supersedes this timing evidence.
      Final gate and completed Linux E2E evidence remain owed.
- [x] 6.13 Replace the generic full-screen countdown with a transparent-outside Azan lower third,
      ordinary editable date/time and Steps, and a persistent announcement at zero until manual Stop.
      Replace the superseded full-screen/auto-close unit expectations with placement and zero-hold checks.
- [x] 6.14 Regenerate the Azan poster/motion excerpt and verify its actual parent Preview, date picker,
      timer-to-announcement transition, persistent hold and manual animated close in the browser.
      The brighter 60/30/10/5/1-minute revision and icon are verified by the current local browser
      checks and refreshed poster/motion review in 6.25. Earlier dark-treatment captures are superseded.
- [x] 6.15 Adopt the owner's saved league layout, centered heading, badge removal, frame-84 keys and
      independent 200/50/30 ms entrance/exit/stagger; normalize asset UUIDs and deduplicate identical
      bindings without modifying or publishing the source project/private paths.
- [x] 6.16 Recapture and browser-check the owner-refined league after the final source comparison.
- [x] 6.17 Extend the guest-title's existing animated name background under its replaceable APASAI
      image without adding a separate plate; pin its containment and retained animations in a unit test.
- [x] 6.18 Recapture and browser-check the guest-title shared plate beneath its logo.
- [x] 6.19 Center forecast numbers and their labels in identical columns, retaining equal 52 px
      typography and separately positioned degree signs; pin this authored alignment in the unit test.
      The later degree-adjacency request in 7.4/7.10 supersedes only the distant degree placement;
      equal type sizes and label alignment remain required.
- [x] 6.20 Browser-check and recapture forecast label/value alignment for differing digit counts.
- [x] 6.21 Remove redundant English suffixes from the five older gallery card titles, keep their
      stable IDs and confirm every scene/root name is Persian-only in a unit test.
- [x] 6.22 Remove the city-weather instructional footer and its animation; sweep all starter
      rendered text for similar training instructions and pin the reported sentence's absence.
- [x] 6.23 Recapture and browser-check the city-weather composition without the instructional footer.
- [x] 6.24 Brighten the Azan lower third, author vivid distinct 60/30/10/5/1-minute Steps and replace
      the right-side Maghrib badge with an appropriate editable Azan icon; preserve zero announcement.
      Focused evidence: 55 starter unit cases, package typecheck and lint passed. New poster/motion
      review is completed locally in 6.14 and 6.25; final gate and Linux evidence remain separate.
- [x] 6.25 Verify stage colors and thresholds through ordinary authoring/rehearsal controls, verify
      zero hold/manual Stop, and visually review the refreshed poster/motion in the browser.
      Controlled `workers=1` browser verification on 2026-11-04 passes both current Azan cases:
      five-minute-threshold colors and a loaded replaceable icon, plus target-to-zero persistent
      announcement, manual Stop and replay. The current poster was visually reviewed; regenerated
      motion is covered by live Preview capture and browser decode/playback checks. Sampled frames
      from the final encoded clip were also reviewed: the bright mosque lower third counts down
      and becomes the persistent announcement. Source-before-capture-before-encode
      ordering is confirmed on 2026-11-04: the scoped
      capture selected `countdown-steps,iran-premier-league` at 20:46:42 local, followed by encoding
      at 20:53:53 local. Regeneration is not owed; final gate and Linux evidence remain pending.
- [x] 6.26 Compare and adopt the owner's second revision of `جدول-لیگ-برتر-ایران.cgproj`, preserving
      authored changes and checking bundled asset bytes without modifying the supplied original.
      Semantic comparison retains every property except the two owner edits: scrim opacity keys
      are now 0/0, 20/0.64, 110/0, 200/0 (the old frame-84 scrim key is removed), and the panel's first
      gradient stop is `#111B2C37`. Title/frame-84 position keys, 200/50/30 ms row timing and all
      eighteen rows are unchanged. All twenty bundled assets remain byte-identical. Source SHA-256:
      `d4c6eefe0f401cec5e71a897b5ea75cb559952a1a25fc342eb773daafc3c30eb`.
- [x] 6.27 Update focused league regressions and regenerate/browser-check affected poster and motion
      after the second revision. Earlier 6.15/6.16 evidence covers only the first supplied project.
      The focused starter suite passed all 55 tests, including the exact second-revision scrim keys,
      retained title/frame-84 keys and panel gradient; starter and Designer builds also pass.
      The later controlled league browser case passes. The current league poster was visually reviewed;
      motion was regenerated after the second-revision source and passes browser decode/playback checks.
      Capture/encode ordering is recorded in 6.25. Sampled frames from the final encoded clip were
      visually reviewed for row build, row exit and the subsequent background fade. Final gate and
      Linux results remain separate from this local completion.

Earlier checkpoint browser evidence: the four authoring cases (including shared GuestTitle plate containment
and centered equal-size forecast columns), four affected poster regeneration and the natural
33.1-second city-weather cycle all pass. The cycle also asserts the instructional footer is absent.
Azan's real target-to-zero/hold/Stop regression passes in 13.1 seconds; league's independent duration,
row-order, containment and background-exit case passes in 9.2 seconds. All five affected posters
were visually reviewed after capture; the remaining six posters were unchanged by these follow-ups.

Checkpoint verification: local full `pnpm gate` passed 103/103 uncached tasks, formatting,
control-byte checks and 123 strict OpenSpec items on 2026-11-04 (gate-20261104T160414Z-19048.log,
exit 0, 720.7 seconds). This verifies this gallery/playback checkpoint, not the still-unmerged
owner-local Designer features or a Linux E2E discharge.

## 7. Additional city-weather cards and compact degrees — Full lane, owner follow-up

The latest decision keeps the original city/forecast templates and the new city-card variant, but
removes only `iran-weather-outlook` / «پیش‌بینی پنج‌روزه — نمای تلویزیونی». The current catalog has
twelve entries and three weather templates. Original four-page pagination and equal 52 px forecast
type remain required; compact degree adjacency is now a targeted correction across all three.

- [x] 7.1 Register the retained `iran-weather-cards` / «آب‌وهوای شهرها — کارت‌های تصویری», the
      removal of only the new outlook, twelve total entries and degree adjacency across all three.
- [x] 7.2 Add the city presentation with large broadcast cards, a bright blue/white palette and
      prominent coherent animated icons, without dominant yellow/turquoise surfaces. Keep originals
      `iran-weather-pages` and `iran-weather-forecast` and their artwork; alter only their degree placement.
- [x] 7.3 Author the new city variant as seven four-card pages plus one three-card page, retaining
      normal Sequence/Repeater authoring, visible choices/rules and one-pass close after the final
      full dwell. The original city template remains four pages of up to eight rows.
      Source progress: `iran-weather-cards.ts` is authored with four 384×600 RTL cards and 6500 ms
      page dwell. The attempted five-column/64 px outlook source belongs to the rejected variant;
      it is not a current deliverable. Current natural-duration browser cases pass for the original
      four-page cycle (32.6 seconds) and the new eight-page cycle (about one minute), including final
      dwell and close without repeating the completed page.
- [x] 7.4 Keep degree signs compactly adjacent to their numbers in all three retained weather templates,
      using ordinary LTR/end numeric and LTR/start degree Text elements 2–3 px apart, preserving
      equal 52 px forecast high/low type and original centered label columns. Do not restore page counters,
      instructional footers or percentages.
- [x] 7.5 Add focused source and real-browser regressions for the city addition, twelve-card catalog,
      preservation of both originals, new geometry, complete city order,
      eight-page natural completion, last-page dwell/exit, fields/rules and continuous animated icons.
      Current starter validation passes 65 tests across five files. Current browser checks pass for
      the new city Choice list, card geometry and animated icon, both natural city cycles, and all
      three weather templates' degree placement. Designer's two realms pass typecheck and build.
- [x] 7.6 Generate and visually review the city-card poster/motion against the supplied direction
      and actual Designer Preview, recapture all three retained weather templates for degree adjacency,
      and refresh the gallery without the rejected outlook.
      Historical thirteen-entry evidence: the expanded starter suite passed 67 tests and builds
      succeeded; both then-new posters were captured before the small photo-within-card addition.
      That evidence does not verify the current twelve-entry/removal/degree revision. Preview readiness
      is a separately registered product fix in `../preview-command-data-workspace/tasks.md`, not
      something discharged by repeating a failed capture.
      Current evidence: all three weather posters and motion clips were regenerated and visually
      reviewed on 2026-11-04. At 30 fps and encoded 1.15× speed, city cards are 158,880 bytes / 5.33 s
      from 390 painted source frames; the original forecast is 82,077 bytes / 5.37 s from 370 frames;
      original city pages are 113,344 bytes / 5.33 s from 293 frames. Each clip's first 45 decoded
      frames contains 45 distinct pictures. All three remain below the 180 KB per-card ceiling.
      The live Designer landing was safely refreshed and its twelve entries verified, with both
      originals and city cards present and only the rejected outlook absent. This does not claim a
      complete latest all-gallery/shell acceptance result or final repository gate.
- [ ] 7.7 Run final checks and record the completed carrying-commit Linux E2E URL; earlier green
      source snapshots do not discharge this new Full-lane revision.
- [x] 7.8 Record the new built-in-generated daylight sky asset's provenance using its project-relative
      path only; keep original artwork untouched. Asset registration and rendered verification are
      covered by the current source/browser and media evidence above.
- [x] 7.9 Remove only the new outlook entry and its exclusively owned references/media, keeping both
      original weather entries, the new city cards and their shared sky/icon assets.
- [x] 7.10 Verify compact degree adjacency for one-/two-digit values, negatives and Persian digits in
      a real browser within existing ranges (forecast −50…60; city templates −40…60). Confirm numeric
      data, ranges and original layout/pagination are intact; do not assert exact glyph-pair centering.
      Actual glyph-gap assertions pass for 7, 23 and −7 in Canvas and Preview in all three templates,
      measuring 0–8 px. The earlier 18-passed / 1-failed batch remains historical: the zero-width
      measurement selected content inside a hidden ancestor. The fixture now checks effective ancestor
      visibility before measuring; the subsequent current degree checks pass without relaxing the gap.

## 8. Deferred IDM overlay investigation — low priority, after templates

- [ ] 8.1 After the city-weather addition, degree repair and remaining template work is complete, reproduce the reported Landing
      “Download this video” overlay and separate extension-injected UI from application behavior.
- [x] 8.2 Evaluate a narrowly scoped mitigation without breaking normal downloads or lazy/silent
      hover/focus playback; report verified capability limits instead of promising extension control.
      Read-only official-source review is complete. [IDM documents per-site panel exceptions](https://internetdownloadmanager.com/register/new_faq/video18.html)
      under its browser-panel settings; applying that documented host mechanism here would target
      `localhost` and `127.0.0.1`, without a URL scheme. This has not been reproduced with the locally
      installed extension, and no setting was changed. [Chrome documents controlsList for native media controls](https://developer.chrome.com/blog/chrome-58-media-updates?hl=en),
      which does not establish an extension-overlay opt-out. Task 8.1 remains pending.
- [ ] 8.3 If a safe application-side change is justified, register its concrete scope and verify it
      independently before claiming a fix. No implementation or extension-setting change is done now.
      No reliable application-side change is justified by the current evidence; no fix is claimed.

## 9. Owner-supplied network-logo project — Full lane, bounded follow-up

- [x] 9.1 Register the request to adopt the owner's `ارم-شبکه.cgproj` refinements and regenerate
      the logo starter's poster and motion, without changing the original supplied project.
- [x] 9.2 Compare the supplied scene and bundled asset bytes with the current logo starter, document
      its exact authored delta, and adopt only those changes with safe portable asset references.
      Read-only comparison is complete: remove `lb-sep`, `lb-tag`/`sub-tag` and the tag field/binding;
      wordmark Y 24 → 50; add linear X-position frame 44/value 28 while retaining frames 32/54/74/92.
      Only image and wordmark children remain. Both image/font assets are byte-identical to the
      bundled assets. The exact source delta is adopted; the original's SHA-256 remains unchanged.
- [x] 9.3 Add focused preservation regressions and verify the revised logo in Designer/Preview.
      Three unit cases are authored for exact geometry/tracks, preserved image/lifecycle and remaining
      channel binding. The landing assertion checks the image/wordmark and absent separator/subtitle.
      Current starter validation passes 68 tests across six files, including all three owner-revision
      cases. The subsequent five-case browser batch passes in 22.9 seconds, covering Landing import,
      six-box public Looks presets, blank-before-Play behavior and both updated logo captures.
- [x] 9.4 Regenerate and visually review the logo poster and smooth 30 fps / 1.15× motion excerpt.
      The new poster was visually checked to show the complete logo image and wordmark only.
      The new clip is 48,929 bytes / 6.50 seconds at 30 fps, from 268 painted source frames with
      median capture spacing 13.40 ms; its first 45 decoded frames contain 26 distinct pictures.
      This verifies the adopted project rather than reusing the earlier logo capture.
- [ ] 9.5 Include the logo delta in the final gate and record completed carrying-commit Linux evidence.
      The fresh Designer build and seven-case landing rerun passed (browser run: 34.3 seconds).
      The first final-gate attempt exposed three lint errors in the readiness test's empty
      ResizeObserver stubs. Those now use typed mocks and focused lint passes; a fresh full gate
      remains required. The interrupted first attempt is not a green result.
      Subsequent corrected-tree gate `gate-20261104T190855Z-16092.log` passes all 103 uncached
      tasks, formatting, control-byte checks and 141 OpenSpec items, exit 0 in 727.5 seconds.
      Carrying-commit Linux evidence remains outstanding; prior failed attempts are not relabelled.

## 10. Owner-supplied lower-third, forecast and league revisions — Full lane, 2026-11-08

- [x] 10.1 Compare the three supplied `.cgproj` files semantically and keep the originals read-only.
      SHA-256: lower third `5327b3a2bd8f5d4b13608fa473cdbc802d31098b161f277dcc20c79ce9884d37`;
      forecast `b7a4667fa2564eef56db84110eb031ef6fbcdf4274139c4bc6d4a2864cf59474`;
      league `35bb7e6d65ee859c20f08696642e25f905fbd3dfbb90aefccd81a19f0f8cac75`.
- [x] 10.2 Adopt the saved lower-third headline/file source/image separator, forecast timed exit and
      motion, and league crest choices/locked workbook source using portable starter asset keys.
      Preserve the lower third's existing brand binding because the supplied save omitted it as a
      projection artefact rather than an owner-visible design change.
- [x] 10.3 Add exact focused regressions for the adopted fields, keyframes, row transitions and all
      eighteen crest choices. The focused starter run passes 37 tests across three files; starter
      typecheck also passes.
- [x] 10.4 Regenerate and visually review the affected posters and motion clips from the adopted
      sources. The lower third, forecast and league captures contain 305/295/197 real painted source
      frames and encode to 62,072 / 75,571 / 134,513-byte VP9 clips lasting 5.37 / 5.37 / 5.93
      seconds. All three current posters and representative decoded motion frames were visually
      reviewed. The seven-case Landing run, including all twelve clips' real browser decode check,
      emitted seven passing results; its known local Vite teardown then remained open and was
      manually terminated rather than relabelled as a normal process exit.
- [ ] 10.5 Run the final repository gate and record carrying-commit Linux evidence; focused results
      do not discharge this Full-lane follow-up.
      The current local carrying tree passed 103/103 uncached gate tasks plus formatting,
      control-byte checks and 149 strict OpenSpec items on 2026-11-08
      (`gate-20261108T151635Z-11184.log`, exit 0, 9m56s before repository-wide final checks).
      Completed carrying-commit Linux evidence remains outstanding, so this task stays open.

## 11. Azan glass restyle — bounded owner follow-up, 2026-11-08

- [x] 11.1 Record the requested glass direction without changing the countdown/zero/manual-Stop contract.
- [x] 11.2 Restyle the ordinary Azan shapes with a translucent body, highlight, light edge and depth shadow while retaining readable Step colors.
- [x] 11.3 Add exact source regressions for the glass layers and run focused starter/runtime checks.
- [x] 11.4 Refresh and visually inspect the Azan poster/motion in the running Designer. The scoped
      poster capture passed, the motion capture produced 262 real painted frames and encoded to a
      58,452-byte VP9 clip lasting 5.33 seconds, and the eleven-case starter authoring/Landing run
      (including Chromium decoding of every gallery clip) passed.
- [ ] 11.5 Include the restyle in the final repository gate.

## 12. Azan re-review — 2026-11-09

- [x] 12.1 Replace the pale bar with a navy and teal glass body, warm seam and raised mosque badge.
- [x] 12.2 Recapture the poster and hover excerpt from the revised scene. The focused capture run
      passed all four tests, including both countdown behavior cases. The 120 source frames encode
      to a 59,415-byte 640×360 BT.709 VP9 clip at 30 fps lasting 5.33 seconds.
- [x] 12.3 Verified this iteration in the Chromium gallery. The owner requested a different visual
      treatment afterward, tracked below.

## 13. Azan visual redesign — 2026-11-09

- [x] 13.1 Redesign the glass modules, typography and replaceable prayer-time mark while retaining
      element roles, Step thresholds, date/time binding and manual Stop.
- [x] 13.2 Verified the new poster, zero state and the gallery's motion decoding in Chromium.
      The scoped 106-frame capture produced a 55,152-byte 640×360 BT.709 VP9 clip at 30 fps.
- [x] 13.3 The pre-push gate passed 103 uncached tasks and 164 strict OpenSpec checks on
      `d6383de0` (`gate-20261109T002047Z-18768.log`).

## 14. Clock ticker separator — 2026-11-09

- [x] 14.1 Give the clock ticker its own bundled Project Assets separator icon.
- [x] 14.2 Resolve starter project-image separator keys at import. Keep Shared Library IDs.
- [x] 14.3 Chromium exported the clock ticker with its imported local separator asset. Rebuilt
      the poster and a 61,315-byte BT.709 VP9 hover clip from 171 captured frames.

## 15. Static four-frame teaching example — 2026-11-09

- [x] 15.1 Remove Hold Start and Outro Start from the main composition and all four preset
      compositions. Use Static playback and keep Cut as the preset transition.
- [x] 15.2 Chromium verified all five timelines, switched the canvas through each preset and
      unpacked the exported Static package with all four presets. All 71 starter tests passed.
- [ ] 15.3 Run the repository gate and read the carrying commit's Linux E2E result.
