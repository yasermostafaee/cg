## 1. Schema

- [x] 1.1 Add optional `lifecycle: { introEndFrame, outroStartFrame }` to the
      composition in `packages/shared-schema/src/scene.ts`, validating
      `activeRange.in ≤ introEndFrame ≤ outroStartFrame ≤ activeRange.out`
      (absent `lifecycle` = today's behavior)
- [x] 1.2 Add optional `playout: { mode: 'manual'|'auto-out'|'loop-cycle'|
      'content-driven'; holdMs?: number; repeat?: number|'infinite' }`
      (default `manual`); validate `holdMs ≥ 0` and `repeat ≥ 1`

## 2. Runtime lifecycle

- [x] 2.1 `frame-driver.ts` — support "play a sub-range once and stop at its end"
      and a cycle mode; stop defaulting to the unconditional `% span` loop for
      lifecycle compositions
- [x] 2.2 `runtime.ts` `play()` → play IN (`activeRange.in → introEndFrame`) then
      hold; do NOT loop the whole range; do NOT auto-play the outro
- [x] 2.3 `runtime.ts` `stop()` → play OUT (`outroStartFrame → activeRange.out`)
      then settle hidden (jump to `outroStartFrame` if stopped mid-intro)
- [x] 2.4 Add `pause()` / `resume()` (freeze/continue at current frame; no args)
- [x] 2.5 Timing orchestrator: `auto-out` (IN + `holdMs` → OUT); `loop-cycle`
      (IN → hold(`holdMs`) → OUT → repeat `repeat`× or until stop); route
      `content-driven` through the same orchestrator via a runtime duration hook
      (computation deferred to the ticker item)

## 3. Designer UI

- [x] 3.1 `features/timeline/*` — draggable intro-end / outro-start markers with
      the phase invariant enforced
- [x] 3.2 `features/inspector/PlayoutTimingSection.tsx` — no-code mode dropdown +
      hold (ms) + repeat; wired to the composition `playout` config
- [x] 3.3 `platform/preview.ts` — reflect hold / pause / auto-out / loop-cycle;
      add `pause` / `resume` preview actions (and surface in the preview modal)

## 4. Export (extends D-019)

- [x] 4.1 `platform/ExporterSingleFile.ts` + `packages/vcg-format` metadata — carry
      `introEndFrame`, `outroStartFrame`, `mode`, `holdMs`, `repeat`, and the outro
      duration in ms (`(activeRange.out − outroStartFrame) / frameRate × 1000`)

## 5. Tests + gate

- [x] 5.1 `shared-schema` — phase invariant enforced; bad `playout` rejected;
      absent `lifecycle` behaves as before
- [x] 5.2 `template-runtime` — play holds at introEnd and does NOT loop; stop plays
      out; pause/resume; auto-out fires after hold; loop-cycle repeats N then stops
- [x] 5.3 `apps/designer` — timeline markers store test (invariant); preview
      reflects pause/auto-out
- [x] 5.4 `apps/designer`/`vcg-format` export test — metadata carries phases,
      timing, and outro-ms
- [x] 5.5 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/vcg-format`, `@cg/designer`
- [x] 5.6 `pnpm openspec validate add-animation-lifecycle-timing --strict`
