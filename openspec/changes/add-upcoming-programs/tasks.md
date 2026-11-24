# Tasks — Upcoming Programs (D-219)

Lane **FULL**. The change adds persisted authoring state and later reaches the program output.

## 1. Designer authoring and safe sample rehearsal

- [x] 1.1 Add the native Upcoming Programs schema, creation and persistence paths, and the
      dedicated Designer Inspector. Expose four layouts, Show airtime, Visible cards where
      applicable, and Automatic/Manual plus dwell where applicable.
- [x] 1.2 Render Single, Side by side, Sequential and Carousel from one element renderer in
      Designer. Keep authored settings in projects and template export, and keep the seven
      sample entries private in the default rehearsal-only source.
- [x] 1.3 Implement the Designer preview transport for manual and automatic advance. Confirm
      real-browser layout bounds, a long Persian title, mixed-direction time and focus navigation.
- [x] 1.4 Update the original Playwright coverage for **Author all four layouts from the Inspector**
      and the new rehearsal and export contracts in 1.10. Retain the original RTL, seven-card,
      manual Carousel and timed Sequential coverage.
- [ ] 1.5 Verify schema, runtime, Designer and export coverage. Run strict OpenSpec validation,
      the full local gate and real Designer Playwright. Record the carrying green Linux E2E step.
      The refreshed Designer and tool icon Playwright suites passed 24 cases on Windows.
      The focused template Runtime and schema runs passed 65 and 21 cases, respectively.
      Strict OpenSpec validation succeeded.
      Windows Designer Playwright recorded 463 passed, 15 skipped and 2 failed.
      The weather icon transition passed in isolation. B-217's video decode failure at scrub
      frame 150 reproduced on both the feature commit and baseline `975081e4`.
- [x] 1.6 Author shared card dimensions, background, border and focus style, independent title
      and airtime formatting and region geometry, and a Designer-only media placeholder. Verify
      real geometry, focus movement and persistence against **Style the cards and align title,
      airtime and media independently**. Verify exported playback suppresses the placeholder.
- [ ] 1.7 Author Next effect and duration for Sequential and Carousel through the shared sequence
      transition engine. Verify save/export, manual and automatic rehearsal with Playwright, and
      effect duration independent of dwell against **Rehearse the authored Next effect in
      Sequential and Carousel**. Record the updated local gate and carrying Linux E2E result.
- [x] 1.8 Author Repeat for Sequential and Carousel through the shared sequence driver. Verify the
      finite exit and infinite wrap after complete passes with focused runtime tests and Designer
      Playwright for **Rehearse finite and infinite repeats**. Verify the setting survives save/export.
- [x] 1.9 Add the designer-owned Content-driven Hold opt-in with normal composition Outro. Cover
      one Dwell for Single and Side by side, finite timed and manual paging, multiple drivers,
      Exit delay, infinite + Out, fresh takes, empty data and legacy scenes with focused runtime and
      Designer Playwright coverage for the two Content-driven scenarios.
- [x] 1.10 Add a local test-entry editor for count, order, title, airtime and Project image/video/sound.
      Exercise save/reopen, decoded video progress and focused sound audition in Designer Playwright,
      including the default-off state and silence in Side by side, pause, focus changes and Out.
      Verify rehearsal-only `.vcg` and standalone HTML omit private rows and sole-use media and
      sounds while retaining authored settings and shared production assets. Map to **Edit, save
      and rehearse local media and text**, **Audition and silence the focused program in Designer**,
      and **Export and play without test rows or assets**. Record local audio audition separately
      from PGM acceptance.
- [x] 1.11 Verify independent title and airtime Auto/RTL/LTR controls, stable numeric-only airtime
      alignment in a real browser, and per-field inheritance for focused card text. Map to
      **Keep numeric and Persian airtime aligned while styling focus**. Verify save and export.
- [x] 1.12 Verify Carousel row direction and each fixed focus slot across list boundaries, distinct
      wrapped neighbors, and separate sizes and opacity. Map to **Use the chosen direction and
      fixed focus slot through a list boundary**. Verify focus order, Repeat, save and export.
- [ ] 1.13 Verify the revised creation preset against **Create the new default and reopen an
      existing design**. Check drop placement, three cards, four-second dwell, one pass and
      simultaneous left/right slides. Verify the updated design and seven editable English
      titles and airtimes on creation. Reopen saved style and row fixtures, including a project
      with Persian text and an intentionally empty list, to confirm creation defaults stay scoped
      to new elements. Verify Designer Rehearsal artwork for the new examples disappears on
      selecting Prepared and stays outside both export formats. Retain the independent mixed-direction
      text browser coverage with authored RTL rows. Record local Playwright and the carrying green
      Linux E2E step.
      Local Playwright loaded all seven distinct starter stills and verified their exclusion
      from both rehearsal-only and Prepared standalone HTML.
- [x] 1.14 Verify the media frame's independent border width, color, radius and letterbox background
      with real browser media. Measure the unchanged aperture bounds and card border, including a
      zero-width media border. Reopen and export the saved treatment. Map to **Adjust the media border
      and letterbox while keeping the card appearance**.
- [ ] 1.15 Measure Auto, a nonzero Fixed gap and Fixed zero in browser Side by side and Fixed
      Carousel with overlap off, including the visible edges of differently scaled cards. Verify
      fitting at narrow bounds and preserve the saved gap on reopening and export. Map to **Use
      an automatic or fixed card gap and preserve the bounds**. Verify Top, Center and Bottom
      reference lines from actual card bounds per row in **Align the actual card bounds with
      different heights**. Check scaled focus, overlap, fixed-height row-group placement, older
      Top fallback in the Inspector and persistence of explicit Center. Record the carrying green
      Linux E2E step for the appearance scenarios.
      Local Playwright measured all three Carousel anchors with different card sizes.
- [x] 1.16 Verify **Choose Project media and generate a poster for the selected video** in Designer
      Playwright. Check the asset-only modal, its empty state and direction to Project Assets,
      selection of existing photos and videos for the initiating test entry, and cancellation
      preserving the current assignment. The row actions use compact icons. Verify video poster
      generation and export in 1.19.
- [ ] 1.17 Author and persist independent group Entrance and Exit effects and durations. Verify
      real Rehearse group animation, unchanged Next/focus navigation, normal Out, quick Stop,
      finite completion through Content-driven Outro and one-shot exit when Out races completion.
      Verify fresh play, save/export and no implicit group effects for older elements and the new
      Push right default. Map to **Rehearse one group entrance and an independent normal Out** and
      **Finish a finite run through the group Exit and composition Outro**. Record focused runtime
      and Designer Playwright evidence and the carrying green Linux E2E step.
      Local Playwright verified group entrance, Next, normal Out, quick Stop and export. Focused
      Runtime covered finite exit and the composition Outro.
- [ ] 1.18 Add the explicit Designer Prepared source to the existing editor. Cover default and
      legacy privacy, switching to Prepared and back, typed rows and selected assets in `.vcg` and
      single-file HTML, prepared picture and video in supported playback, preserving independent
      asset references and keeping audition local. Map to **Publish a prebuilt show's list and
      selected media explicitly**. Record export validation, Designer Playwright and carrying Linux E2E.
      Local package tests verified Prepared assets and private rehearsal defaults. Playwright
      decoded the assigned Prepared video and verified the matching title and airtime.
- [ ] 1.19 Verify **Transfer motion to the focused card during page changes** with real local video
      in Designer Rehearse and Prepared playback. Cover current-card motion, reusable Project
      posters generated from conformed video, Prepared packaging of those posters, and legacy
      decoded-frame or text fallback. Verify Side by side stays still and the outgoing video and
      sound stop at the focus change during simultaneous effects. Cover **Display the source
      video as one asset with its linked poster** in Project Assets and the Test media picker,
      including linked video thumbnails/preview, reopening older projects, independent image
      references, and unchanged stored assets and Prepared playback. Record focused runtime,
      Designer Playwright and carrying Linux E2E evidence.
      Local Playwright verified the generated poster image with decoded pixels after focus moves,
      no video element on a poster-only card, and still Side by side playback.
      The video chooser shows a thumbnail before assignment. Playwright verified a single video
      entry in Project Assets and excluded its derived image from both visible selectors.
      Project package restart tests verified the video-to-poster link and ordinary image reuse.
- [ ] 1.20 Verify **Move focus across three cards before entering the next group** and **Scale a
      focused card above its neighbors independently of focus behavior**. Measure actual card and
      slot bounds in Designer Rehearse. Check fixed-slot defaults on new and reopened legacy
      elements, both focus modes with overlap on and off, in-group scale and opacity duration,
      stable slot gap, overlap stacking, group boundary Next effect, partial final group and Repeat.
      Verify motion ownership across focus moves, save and export. Record local Playwright and the
      carrying green Linux E2E step.
      Local Playwright measured stationary card centers, overlap stacking, and the move to the
      next group. Focused Runtime tests exercised pause, advance, and video ownership.
- [ ] 1.21 Verify **Choose different digit sets for ordinary and focused title and airtime** in
      Designer Playwright. Cover Keyboard, Persian, Latin and Arabic-Indic in both roles, focused
      Inherit, text direction and alignment preservation, and legacy settings absent. Verify raw
      title and airtime data and the separate display choice after save/reopen and Prepared export.
      Local Playwright verified all four independent selectors, focused Inherit and separate RTL
      alignment. Schema and Runtime tests verified legacy and focused inheritance behavior.
- [ ] 1.22 Author and persist independent Entrance motion and Exit motion modes with their
      stagger duration, interval and card order controls. Map real Designer Playwright and
      focused runtime tests to **Stagger the first visible cards in the authored logical
      order**, **Stagger normal Out and finish all cards before Content-driven Outro**, and
      **Reopen and export independently authored card motion**. Verify visible Side by side
      and Carousel cards animate in the chosen order, including RTL and partial groups.
      Verify the effect duration and stagger interval independently, legacy Together behavior,
      Next and focus movement without a second Entrance, Out during finite Exit, and quick Stop
      canceling pending effects. Verify final delayed Exit before Content-driven completion in
      the exported template runtime. Record the focused results and carrying green Linux E2E step.
      Local Designer Playwright passed staggered Entrance, reverse-staggered Out, independent
      Next, project save/reopen and playback from standalone HTML. Focused schema and runtime
      suites verified legacy defaults, timing and partial groups, visibility-gated focus media,
      Quick Stop and completion only after the last exit. The carrying Linux result is pending.
- [ ] 1.23 Author and persist Exit then enter for Next motion with separate Current page exit and
      Next page entrance effects, motion modes, durations, intervals and logical card orders.
      Verify **Finish the current page's cards before entering the next page**, **Use Next motion
      only when the displayed page changes**, and **Save, export and stop independent Next page
      motion** in focused runtime and Designer Playwright. Cover last-to-first exit, first-to-last
      entrance, independent durations and intervals, the phase handoff, manual Next and Previous,
      automatic advance, Fixed Carousel, Across cards with in-group focus and a short final group,
      Sequential, RTL order, and old and new focused video across the change. Cover normal Out and
      Quick Stop during both phases, finite Content-driven completion, legacy Page effect, and
      save/reopen and export. Record the full local gate and carrying green Linux E2E step.
      Local Designer Playwright measured reverse outgoing cards, forward incoming cards, no
      visible overlap at the handoff, independent scene boundaries and in-page focus hops. Focused
      Runtime and Schema tests passed, including RTL order, short final groups, paused and queued
      turns, Cut and Together phases, Out, Quick Stop and single focused-video ownership.

## 2. Standalone CG Control preparation and Playout data

- [ ] 2.1 Confirm a target Playout rundown contract for ordered eligible events, stable occurrences,
      actual program identity and updated timing. The owner confirmed on 2026-11-24 that the
      real API or file-delivery path is still undecided. Playout adapter integration and acceptance
      depend on that contract. Designer Prepared and standalone CG Control manual preparation can
      proceed independently.
- [ ] 2.2 Add typed Bridge methods and schema for the normalized feed and the graphic's prepared
      payload. Use the active channel's authorized scope and pin fixture/adapter coverage.
- [ ] 2.3 Add operator selection, independent count and page navigation, title/time overrides,
      refresh and preview. Verify fewer entries, duplicate media, changed timing, event exclusion,
      reordered schedules and independent PVW/PGM state against the runtime spec scenarios.
- [ ] 2.4 Localize the operator surfaces in English, Persian and Arabic and validate the two RTL
      interfaces in a real browser. Run the carrying Linux E2E with the new operator scenarios.
- [ ] 2.5 Verify the CG Control source contract across packaged Prepared, Manual and Playout modes.
      Exercise explicit ready updates on the live graphic, invalid source/media and a concurrent
      automation refresh. Map to **Use Designer Prepared, operator Manual or the active Playout
      list** and **Update prepared content live without restarting the graphic**. Complete Playout
      adapter and plant acceptance against the real target contract, media readiness and PGM.
- [x] 2.6 Implement standalone CG Control manual preparation per stack row. Start from a copy of
      published Designer rows or an empty list, and allow add, remove, reorder and per-program
      title, airtime and photo/video edits. Keep each stack row independent. Show the current
      draft in browser Preview, confirm valid changes for the row's explicit Take and retain the
      last confirmed list after canceled or unsuccessful edits. Localize this operator flow in
      English, Persian and Arabic.
- [ ] 2.7 Verify **Edit one stack row starting with the Designer Prepared list**, **Build an
      empty stack row without Playout** and **Preview and confirm the draft without changing
      program output** with CG Control Playwright. Cover two stack rows using the same
      template, unapproved sample exclusion, mixed-direction titles and times, media and focused
      playback, preview isolation after switching rows, and confirmation without a broadcast
      command. Verify explicit Take uses the confirmed row and preview cannot replace an active
      graphic. Record the full local gate and carrying green Linux E2E for the manual path.
      The focused Bridge integration verified a missing upload preserves the last confirmed list,
      off-air preparation sends zero AMCP, the resident UPDATE carrying the content hashes precedes
      PLAY, on-air preparation is refused and Stop preserves the confirmed list. The template HTTP
      server returned the uploaded poster and the requested video range. A refused resident UPDATE
      prevented PLAY, and retry used the confirmed list.
      The three CG Control browser cases passed locally, including PNG and moving WebM in PVW,
      staged Take refusal, off-air Update, Discard, and isolation between two rows using the same
      template. The empty Manual list cases verified the Persian and Arabic editor and media picker.
      All 16 Designer Upcoming Programs browser regressions passed against the rebuilt renderer.

## 3. Pictures, excerpts, and audio

- [ ] 3.0 Bind real program data and prepared media into the authored regions. Rehearse the
      full-screen and overlay compositions with the same program payload.

- [ ] 3.1 Resolve authorized image/promo identities, preview/edit approved excerpt in/out, and
      resolve the provider and generated poster or fallback before Take. Preload motion for the
      expected focus and stills for other cards using the supported engine/asset path. Verify
      **Change media focus without overlapping motion or audio** for the accepted Prepared,
      Manual and Playout output paths.
- [ ] 3.2 Add poster and text fallbacks with deadlines. Exercise missing/pending media and verify
      that each page uses only a ready visual or its fallback.
- [ ] 3.3 Add optional local audition, the approved full-screen sound choices and overlay mix
      policy, verified against the **Audition and air a promo without leaking audio** scenario.

## 4. Overlay and full-screen playlist playout

- [ ] 4.1 Adopt the authenticated Playout secondary-event trigger and host-window contract.
      Verify Preview/Take/Next/Previous/Out behavior, clean handoff and existing PGM continuity.
- [ ] 4.2 Adopt the independent Playout graphics-primary contract. Verify its own slot, ready
      payload, early authored Outro, hard out during manual paging or infinite Repeat, and correct
      picture and audio handoff.
- [ ] 4.3 Prepare a reviewed video fallback for clip-only primaries. Verify duration, exact
      revision and format. Cover schedule changes, disconnected input and skip/filler behavior.
- [ ] 4.4 Run both runtime E2E paths and the target Playout Engine acceptance on main and backup,
      including late edit, failover, decoder fallback, audible PGM and As-Run evidence. Record the
      carrying green Linux E2E step and target engine evidence before closing the change.
