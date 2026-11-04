# Tasks — production starter gallery (D-179, owner re-review)

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
- [x] 5.11 Regenerate lazy, silent, smooth 30 fps WebM excerpts at a modest 1.15× rate for every gallery card; play on hover or
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
- [x] 6.15 Adopt the owner's saved league layout, centered heading, badge removal, frame-84 keys and
      independent 200/50/30 ms entrance/exit/stagger; normalize asset UUIDs and deduplicate identical
      bindings without modifying or publishing the source project/private paths.
- [x] 6.16 Recapture and browser-check the owner-refined league after the final source comparison.
- [x] 6.17 Extend the guest-title's existing animated name background under its replaceable APASAI
      image without adding a separate plate; pin its containment and retained animations in a unit test.
- [x] 6.18 Recapture and browser-check the guest-title shared plate beneath its logo.
- [x] 6.19 Center forecast numbers and their labels in identical columns, retaining equal 52 px
      typography and separately positioned degree signs; pin this authored alignment in the unit test.
- [x] 6.20 Browser-check and recapture forecast label/value alignment for differing digit counts.
- [x] 6.21 Remove redundant English suffixes from the five older gallery card titles, keep their
      stable IDs and confirm every scene/root name is Persian-only in a unit test.
- [x] 6.22 Remove the city-weather instructional footer and its animation; sweep all starter
      rendered text for similar training instructions and pin the reported sentence's absence.
- [x] 6.23 Recapture and browser-check the city-weather composition without the instructional footer.

Latest browser evidence: the four authoring cases (including shared GuestTitle plate containment
and centered equal-size forecast columns), four affected poster regeneration and the natural
33.1-second city-weather cycle all pass. The cycle also asserts the instructional footer is absent.
Azan's real target-to-zero/hold/Stop regression passes in 13.1 seconds; league's independent duration,
row-order, containment and background-exit case passes in 9.2 seconds. All five affected posters
were visually reviewed after capture; the remaining six posters were unchanged by these follow-ups.

Checkpoint verification: local full `pnpm gate` passed 103/103 uncached tasks, formatting,
control-byte checks and 123 strict OpenSpec items on 2026-11-04 (gate-20261104T160414Z-19048.log,
exit 0, 720.7 seconds). This verifies this gallery/playback checkpoint, not the still-unmerged
owner-local Designer features or a Linux E2E discharge.
