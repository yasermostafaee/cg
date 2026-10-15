# Tasks — `add-audio-element` (`D-165`)

## 1. §0 — measure first (a "no" stops the change)

- [x] 1.1 A template page's sound reaches CasparCG 2.5.0's output — the channel meter read −6.02 and
      −18.06 dBFS for those tones; no flag, no gesture (design.md §0.1)
- [x] 1.2 The page layer's volume traced: muted before every ADD, raised at the take before PLAY,
      muted by rehearse on a resident row (§0.2)
- [x] 1.3 The Playout contract: nothing forbids a page's own sound; the letter's facts listed (§0.3)
- [x] 1.4 The previews: Designer Preview audible with a switch, PVW silent (§0.4)

## 2. Schema and runtime (`f8c1f8ef`)

- [x] 2.1 `audio` element (`start`, `volumeDb` −60…+6, fades) and `audio` asset kind + metadata;
      `hasSoundEffects`
- [x] 2.2 `AudioDriver` (when) + `audio-graph` (how: gain, fades, look-park silence, master mute);
      wired at play, pause/resume, the outro list, the settle, the loop cycle and destroy
- [x] 2.3 `buildAudio` — a never-painted `<audio>` in the scope's tree; the asset walk sets its `src`
- [x] 2.4 Both exports carry the WAV (`assets/audio/<sha>.wav` + `kind: 'audio'`;
      `data:audio/wav`); a missing sound is a preflight error
- [x] 2.5 CG Control: `TemplateInfo.hasSound` at import, the row's speaker `Tag`, PVW muted on load;
      the import no longer narrows `audio` to `image`
- [x] 2.6 On air (the built element through the shipped exporter): 0 dB → −6.02 dBFS, −12 dB →
      −18.02, +6 dB → −0.02, exit sound silent until `CG STOP`, silent under a hard `CLEAR`

## 3. Designer (`ab10f0c0`)

- [x] 3.1 `Audio…`: batch import through the converter to one 48 kHz stereo WAV; length and peak
      measured from the bytes and shown on the tile; a failure named; a mono sound keeps its level
- [x] 3.2 Dropping a sound places one `audio` element (no canvas box, no gizmo, no Transform)
- [x] 3.3 Inspector Sound section: length, peak, starts, volume (clamped), fades
- [x] 3.4 Preview Sound switch (on by default; re-sent on page boot); the canvas stays silent
- [x] 3.5 Deleting a sound counts and removes its elements; timeline icon

## 4. Tests

- [x] 4.1 Schema: parse, defaults, bounds, round-trip, an older asset unchanged; `hasSoundEffects`
      reach (containers, instances, repeaters, sequence items, hidden, cycles)
- [x] 4.2 Runtime: the driver on a fake clock (entrance, timed + pause, exit resolving at once, the
      settle sparing the exit sound with a live control, a hard Clear silent); the lifecycle in jsdom
- [x] 4.3 Exports: `.vcg` packing + index + assetUrls + closure + missing; single-file inlining
- [x] 4.4 CG Control: the row mark (a Tag, no verb added) and `silencePage`
- [x] 4.5 Designer: wav-stats, conversion args (mono level), panel import, placement
- [x] 4.6 e2e `audio-element.spec.ts` through the real converter — four formats, the Sound section,
      the Preview switch, the `.vcg`. Local Windows: 3 passed
- [x] 4.7 Linux `e2e` RAN on the commit carrying the change —
      [38625458531](https://github.com/yasermostafaee/cg/actions/runs/38625458531) (`f0c3c062`):
      the `E2E` step RAN and completed green — Designer 319 passed / 13 skipped, Runtime 343
      passed / 2 skipped; the three `audio-element.spec.ts` cases passed on Linux (read from the
      run log, not the step badge)

## 5. Docs

- [x] 5.1 `D-165` filed `[~]` in `docs/prd/designer.md`; registry updated
- [x] 5.2 Engine doc: `packages/template-runtime/README.md` names the audio driver beside the video's

## 6. `DELTA-RUN-NEXT-VERSION-01-G` — `B-346`: the timeline's Play was silent (FULL lane)

- [x] 6.1 Located, not guessed: the owner's update corrected the report — the Preview plays; only the
      timeline's Play is silent. The canvas page is only ever SEEKED (`scrub`), so its sounds never
      start, and a frame message is no user gesture.
- [x] 6.2 `runtime.auditionSounds({ playing, frame })` plays each sound at its place while the
      transport PLAYS, through the page's own audio graph (`createAudioHandle`'s audition), and stops
      it with the playhead; the Play click resumes the output inside the gesture
      (`window.cgResumeSound`). Scrubbing stays silent. (`3f6fb431`; `audition-sounds.test.ts`)
- [x] 6.3 ONE Sound switch (`transport-sound`, `Sound on` / `Sound off`, ON by default) in the
      transport, shared with the Preview through the store. (`3f6fb431`)
- [x] 6.4 A sound longer than its composition plays to its end in the Preview (as on air: an entrance
      sound is cut only when the graphic settles); the timeline stops it with the playhead.
- [x] 6.5 Red first, green after: `tests/e2e/timeline-sound.spec.ts` — red with the audition call
      removed while its positive control (the audio element exists, paused) passed; green with it.
- [x] 6.6 `B-346` filed in `docs/prd/bugs-designer.md`; registry updated.
- [ ] 6.7 Linux `e2e` RAN green on the pushed commit — run URL here.
