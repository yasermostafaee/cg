# Live frame placement effects

- [x] Specify a bounded phase plan and validate the optional request and runtime payload.
- [x] Add motion, Fade and duration controls to the on-air frame placement workflow.
- [x] Animate the seated picture and the resident artwork pages with matching phase endpoints.
- [x] Cover combined effects, legacy Cut behavior, a refused foreground update, Stop and
      emergency silence in focused tests.
- [x] Windows Chromium verified selecting Ease in/out with Fade, immediate PVW and Update on air
      through the real Bridge with a mock AMCP engine.
- [x] A local reference-engine file capture at 25 fps verified move, resize, fade-out and
      fade-in of the live input and its tied foreground title, with the correct final geometry.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43623019929/job/132532721505)
      completed its E2E step successfully on `e798ca3b`.
- [ ] Verify picture, title, fallback and mask alignment on the target Playout Engine.
- [x] Carry effect selection and authored frame identity into the on-air preset switch.
- [x] Verify both directions between a one-frame and a two-frame preset, with the shared producer
      retained. Windows Chromium and a Bridge smoke test with the owner's `3ghab-composition.vcg`
      passed.
- [x] Verify the owner's masked `3ghab-crop.vcg` from preset 2 to 1 with the real Bridge and
      mock AMCP. In the Windows Chromium regression, both pages hide the departing group before
      the shared frame moves, its input and volume continue, and the reverse restores the clips.
- [x] Verify refusal during the masked switch restores the outgoing artwork and mixer state.
- [x] Capture the masked switch on a local reference engine at 25 fps. The departing picture
      and mask disappear together before the retained frame grows to full raster.
- [x] Build and verify the three local Windows 1.2.5 installers from `e798ca3b`.
- [x] Rehearse preset and source transitions in PVW and verify no playout commands are sent.
- [x] Animate arriving and departing plates. Confirm the owner's `3ghab-crop.vcg` in both
      directions on the local reference engine, including the mask fragments and the retained
      shot's movement. Verify title visibility by preset in the rendered pages.
- [x] Verify Cut and Fade for an input swap, rollback on refusal, and cleanup after AMCP reconnect.
      A local reference-engine capture shows a dissolve in both directions inside the same frame.
- [x] Disable operator Crop for mask-owning plates while retaining Crop on eligible unmasked plates.
- [x] Verify Bounce and Elastic move phases and their Fade combinations in the phase planner.
      Windows Chromium verifies the Bounce replay in PVW. Bridge integration verifies the native
      mixer phases for both effects and the final recentered geometry.
- [x] Verify the expanded transitions with eight focused Windows Chromium cases.
- [x] Drop the engine connection during a preset change. Verify surviving pages recover their
      prior preset, missing pages are not recreated, and an already-visible temporary mask
      fragment is muted, hidden and cleared on reconnect.
- [x] Verify the Inspector source picker stays open when a delayed scroll event follows its
      click on a small viewport, and that Preview sends no programme commands after Bridge startup.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43648905013/job/132612786379) passed on `ef17ab9a`, including input selection, Preview, both preset directions and the Layers error list.
- [x] Build and verify the three local Windows 1.2.5 installers from `ef17ab9a` in
      `installers/1.2.5/ef17ab9a`, including the setup payload and SHA-256 for every asset.

- [x] Reproduce the reported source Fade refusal on the full 3ghab-crop layout. Verify the
      outgoing source remains parked for the other presets and can dissolve back in.
- [x] Verify a single rectangular mask, and verify refusal preserves a shared or fragmented input.
- [x] Verify Preview remains independent through a refused Fade and follows a later successful
      row action. Verify a newer Inspector cue wins over an earlier asynchronous response.

- [x] Capture the owner's original 3ghab at 1080p25. The retained image stays opaque with
      Fade off and dips on 11 recorded frames with Fade on. The two native movement legs share
      the same tick budget as unfaded movement.
- [x] Verify linked title suppression and release in both output passes and preservation of other
      text. Runtime DOM and Windows Chromium cover title visibility and the confirmed PGM follow.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43659813628/job/132646426527) passed on the combined effects and monitor follow-up at `76a76c80`.

## Preset effects with a configured backup

- [x] Reproduce the installed 3ghab effect eligibility loss with B configured.
- [x] Verify the active engine's effect and guarded settled mirror for eligible presets.
      Windows Chromium and the owner's original 3ghab package passed on two isolated test engines.
      Four preset switches used active tweens and settled the backup on channel 2.
- [x] Verify missing backup inputs and interruption do not write transient geometry to another engine.
      The paired wire cases verify missing media, mapping, a refused active commit, a reconnect and
      ownership transfer after a deferred mixer write.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43667950106/job/132671500381) ran the complete E2E step successfully on `194e37ac`.
- [x] Built CG Control, CG Designer and CG Bridge installers locally from this verified commit.
      Verified the packed setup payloads and SHA-256 in `installers/1.2.5/194e37ac`.

## Directional input changes

- [x] Offer Push and Slide over in all four directions through Input effect.
- [x] Rehearse both effects inside a fixed plate without programme writes.
      Chromium verified the horizontal and vertical paint order and the stationary viewport.
- [x] Verify concealed pre-roll, on-air movement, clipping, neighbouring plates and rollback.
      Bridge integration covers both modes in all four directions. A local reference-engine
      capture verified Push and Slide over using the owner's original 3ghab-crop.
- [x] Verify Fade and directional effects with mirror-sync, including a mapped reserve and
      independent ownership or failure at the two engines. Windows Chromium verified Fade on
      the active engine. Bridge integration verified the reserve cut, refused commands and
      recovery after both engines changed roles.
- [ ] Recheck eligible masked edges and unsupported directions on the target engine.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43686444415/job/132727854018) ran the complete E2E step successfully on `119eb4e1`.

## Frame placement with a configured reserve

- [x] Verify an older Cut-only page and a page with an effect can update their resident frames on the active engine and settle verified reserve seats in place.
- [x] Verify no placement is sent to an unmapped reserve or to an engine promoted while the active effect is in flight.
- [x] Rerun the full Bridge live-seating integration suite and typecheck on Windows.

## Portrait-to-landscape preset switches

- [x] Share a phase start deadline between native pictures and the template artwork.
- [x] Animate fill and clip of retained inputs when the destination fit changes.
- [x] Support directional entrance and departure with independent directions and fade.
- [x] The carrying [Linux gate](https://github.com/yasermostafaee/cg/actions/runs/44128971338/job/134201941144)
      and actual [E2E step](https://github.com/yasermostafaee/cg/actions/runs/44128971338/job/134201941267)
      passed on `ca38e1551cb4f261101ea7f0e264c7d1b7e81348`, covering same-paint PVW picture/clip
      updates and the bounded authored-border timing correction for observed `1080i5000` channels.
- [ ] Capture a real PGM switch with the intended station engine to measure border and input alignment.
