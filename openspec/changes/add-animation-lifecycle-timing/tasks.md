## 1. Schema

- [x] 1.1 Add optional `lifecycle: { outPoint }` to the composition in
      `packages/shared-schema/src/scene.ts`, validating
      `activeRange.in ≤ outPoint ≤ activeRange.out`. Absent `lifecycle` resolves
      (in the runtime) to an implicit out-point at `activeRange.out`.
- [x] 1.2 Add optional `playout: { mode: 'manual'|'auto-out'|'loop-cycle'|'content-driven'; holdMs?: number; repeat?: number|'infinite' }`
      (default `manual`, play-once); validate `holdMs ≥ 0` and `repeat ≥ 1`

## 2. Runtime lifecycle

- [x] 2.1 `frame-driver.ts` — `'once'` (play a sub-range once and stop) + `'loop'`
      modes as building blocks (no unconditional full-range loop default)
- [x] 2.2 `runtime.ts`/`playout-controller.ts` — **default play-once-and-hold**:
      `play()` plays the full `[activeRange.in → outPoint]` once then holds at
      `outPoint`; an absent `outPoint` = `activeRange.out` (whole timeline plays
      once, holds the last frame). NEVER loops by default.
- [x] 2.3 `stop()` → play `[outPoint → activeRange.out]` then settle hidden (empty
      outro settles instantly; jump to `outPoint` if stopped before reaching it)
- [x] 2.4 Add `pause()` / `resume()` (sync, no args; freeze/continue current frame)
- [x] 2.5 Timing orchestrator: `auto-out` (reach `outPoint` + `holdMs` → OUT);
      `loop-cycle` (`[in→outPoint]` → hold(`holdMs`) → `[outPoint→end]` →
      repeat `repeat`× or `'infinite'` or until stop); `content-driven` honors
      `repeat` (N passes then settle, or `'infinite'` loops) with each pass's
      duration from the runtime duration hook (computation deferred to the ticker
      item) and `holdMs` ignored. NO separate continuous-loop mode (a looping logo
      is `loop-cycle` + `repeat: 'infinite'`).
- [x] 2.6 Non-persistent `playoutOverride` (`mode` + `holdMs` + `repeat`, NO `loop`
      flag) on `RuntimeBootOptions`: overrides the stored defaults for one run
      without mutating the scene. The seam for the preview now and the rundown
      later.

## 3. Designer UI

- [x] 3.1 `features/timeline/*` — a single draggable `outPoint` marker with the
      invariant enforced (Loopic-style)
- [x] 3.2 `features/inspector/PlayoutSection.tsx` — no-code `mode` dropdown (+ a
      default). Do NOT put `holdMs`/`repeat` here as static fields.
- [x] 3.3 `platform/preview.ts` + preview modal — reflect hold / pause / auto-out /
      loop-cycle; add `pause` / `resume` actions and buttons; carry
      `playoutOverride` through `scene-replace` → `createRuntime`
- [x] 3.4 Preview modal `PreviewTimingControls` — bind to the **effective** playout
      and re-sync on composition change; live `mode`/`holdMs`/`repeat`, all
      **session-only** (stored defaults unchanged); NO Loop / Play once toggle
      (looping = `loop-cycle`/`content-driven` + `repeat: ∞`); show "no out-point"
      and disable `auto-out` / `loop-cycle` when no `outPoint`
- [x] 3.5 App-local design system — `ui/Button.*` + `ui/Callout.*` vanilla-extract
      recipe on the existing `renderer/theme.ts` palette (no `@cg/ui` change, no new
      palette); give interactive controls hover / active / focus-visible / disabled
      states; route preview styling through it (no ad-hoc inline CSS).
- [x] 3.6 Preview transport `PreviewTransport.tsx` — separate **momentary** playout
      commands Play (`play()`/`resume()` if paused; not a toggle, not stuck-active),
      Pause (`pause()`), Stop (`stop()`), Next (`next()`, disabled when `steps` is 1);
      Reset is a preview-only utility grouped apart from the commands.
- [x] 3.7 Preview modal layout — stage stays prominent; the data-key form scrolls in
      its OWN region (never pushing other controls down); transport + timing overrides
      pinned in a fixed, always-visible bar (`PreviewModal` owns field values + paused
      flag so the fixed transport can `play()` with current data).
- [x] 3.8 Prominent warnings — `PreviewFieldForm` surfaces duplicate data key + field
      validation errors as callouts; `PreviewTimingControls` shows the no-out-point
      notice as a callout (not a muted hint).

## 4. Export (extends D-019)

- [x] 4.1 `platform/ExporterSingleFile.ts` + `packages/vcg-format` metadata — carry
      `outPoint`, `mode`, `holdMs`, `repeat`, and the outro duration in ms
      (`(activeRange.out − outPoint) / frameRate × 1000`). The non-persistent
      override is NOT exported (metadata carries the stored play-once defaults).

## 5. Tests + gate

- [x] 5.1 `shared-schema` — `outPoint` invariant enforced; bad `playout` rejected;
      absent `lifecycle` validates
- [x] 5.2 `template-runtime` — play plays once to `outPoint` and holds WITHOUT
      looping (incl. the no-`outPoint` case); stop plays out; pause/resume;
      auto-out fires after hold; loop-cycle repeats N then stops; content-driven
      with `repeat: 'infinite'` loops and `repeat: N` runs N passes then stops
      (duration from an injected hook, `holdMs` ignored); `playoutOverride` is
      session-only (scene unmutated)
- [x] 5.3 `apps/designer` — `outPoint` marker store test (invariant); preview
      override session-only proven at the runtime seam (`playoutOverride`);
      preview duplicate-data-key detection (`findDuplicateKeys`)
- [x] 5.4 `apps/designer`/`vcg-format` export test — metadata carries `outPoint`,
      timing, and outro-ms
- [x] 5.5 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/vcg-format`, `@cg/designer`
- [x] 5.6 `pnpm openspec validate add-animation-lifecycle-timing --strict`
