# Tasks — media-phases-follow-composition

## 1. Schema (additive)

- [x] 1.1 `LottiePhasesSchema.source` grows `'composition'`; `holdAt` (animation frames,
      optional) added; comments state that stored `introEnd`/`outroStart` are IGNORED under
      `'composition'` and that `holdAt` is meaningful only there.
- [x] 1.2 `VideoPhasesSchema` gains optional `source` (`'manual' | 'composition'`, absent ⇒
      manual-equivalent) and optional `holdAt` (ms); same comments.
- [x] 1.3 Round-trip: scenes with `markers`/`manual`/absent source parse byte-identically; a
      follow scene survives save/reload with the relationship (not baked numbers) intact,
      `holdAt` included.

## 2. The derivation — one helper, one unit adapter

- [x] 2.1 `@cg/shared-schema/follow-window.ts`: `followWindowMs(anchors, clip)` (time-space core;
      video's native unit) + `followsComposition(phases)` predicate. Clamps reported as flags
      (`introShort` / `outroClamped` / `holdPastEnd`).
- [x] 2.2 `@cg/lottie-bridge/timing.ts`: `lottieFollowWindow(meta, speed, anchors, holdAt?)` —
      frames ↔ ms at the edge, comp-side math delegated to `followWindowMs`.
- [x] 2.3 Tests (failing first as module-absent, then green): the owner's 5s/3s/2s case verbatim
      in ms and in frames; default-`H` degeneracy; the four clamp cases; 29.97 vs 50 fps
      agreement within one comp frame.

## 3. Driver capability — offset intro, bounded outro (ONE mapping per kind)

- [x] 3.1 `LottieDriver`: `introStart` (default `ip`) + `outroEnd` (default `op`) options,
      honoured inside `clipPositionAt` (and `reset()`'s park frame) only.
- [x] 3.2 `VideoDriver`: `introStartMs` (default 0) + `outroEndMs` (default `durationMs`)
      options, honoured inside `expectedClipMs` / `tick` / `elapsedForActual` / `start` /
      `reset` / `playOutro` (degenerate check + backstop bound).
- [x] 3.3 Driver tests, FAILING FIRST: an offset window plays `[introStart → introEnd]`, holds at
      `introEnd`, outro `[outroStart → outroEnd]` clamps and resolves at `outroEnd`; defaults
      unchanged for every existing construction.

## 4. Runtime resolution

- [x] 4.1 Hoist the settle aggregation into a pre-pass (same visible gate, same `lottieTiming`)
      and compute `holdEntry` BEFORE the media driver loops; reuse it below (one read).
- [x] 4.2 A follower is fed to `lottieTiming` with `phases: undefined` — the existing null-settle
      path, pinned by a test.
- [x] 4.3 Lottie follow wiring: window from `lottieFollowWindow`; `introEnd = outroStart = H`;
      idle = authored idle ?? none (freeze); poster = `H`; `hasOutro` from the window.
- [x] 4.4 Video follow wiring: window from `followWindowMs`; loop = authored idle ?? freeze at
      `H` (resolved hold only — stored `holdBehavior` untouched); `data-cg-poster-ms`
      overwritten with derived `H`.
- [x] 4.5 No lifecycle ⇒ marker-less behaviour (both kinds).
- [x] 4.6 Re-derivation on marker drag asserted through the store/build path (rebuild with a
      moved `outPoint` / `contentStart` ⇒ the window moves), not UI pixels.
- [x] 4.7 The owner's case, verbatim, through `createRuntime` + `tick(frame)` (scrub path) for
      the Lottie; through driver options for video.

## 5. Inspector (both kinds, same presentation)

- [x] 5.1 "Follow composition" affordance (a BUTTON — see design §9 for why not a select) in
      every state of both kinds; "Detach — edit as manual" in the follow state bakes
      `introEnd = outroStart = H` (`holdAt` kept) and re-enables the inputs.
- [x] 5.2 Under follow: derived window read-only with comp equivalents; ONE editable "hold at"
      input seeded from the shared poster/midpoint helper (reused, not copied); clear reverts to
      default `H`; clamp hints.
- [x] 5.3 No-lifecycle explanation renders (§9.1 rule).
- [x] 5.4 `contentStartDefault` extracted (not copied) so the follow hint and the Playout pin
      share the keyframes-only default.
- [x] 5.5 DOM tests, FAILING FIRST: follow option writes `source: 'composition'`; Detach bakes
      the exact currently-derived values into `manual`; hold-at seed comes from the SHARED
      helper; the no-lifecycle explanation renders.

## 6. Playout checklist truthfulness

- [x] 6.1 `mediaHoldItem.infinite` mirrors the drivers: follow ⇒ authored idle && looping hold;
      non-follow Lottie `idle-loop` ⇒ effective idle span non-empty; video `loop` ⇒ always
      infinite. Tests failing first, including the found-beside marker-less idle-loop Lottie
      case (finite — the driver freezes on a zero idle span and resolves).

## 7. Docs + verification

- [x] 7.1 D-151 PRD item: ⚠ OPEN QUESTION block replaced with the owner's settled answer
      (sharpened Candidate A), both candidates kept as the record of why.
- [x] 7.2 Engine doc-sync: `packages/template-runtime/README.md` (driver window options +
      resolution), `docs/engines/overview.md` if the contract summary needs the third source.
- [x] 7.3 `pnpm openspec validate media-phases-follow-composition --strict` green.
- [ ] 7.4 Full green gate (uncached) for every touched workspace.
- [ ] 7.5 Commit + push to `dev`; remote head verified.
- [ ] 7.6 **E2E**: Linux `gate:e2e` debt discharged by a COMPLETED, GREEN `e2e` job that RAN for
      the pushed commit — run URL recorded HERE beside this box when it exists.
- [ ] 7.7 Handoff `docs/handoff/2026-08-13-session-s.md` (mint no item number; PRD registration
      of this change is the owner's).
