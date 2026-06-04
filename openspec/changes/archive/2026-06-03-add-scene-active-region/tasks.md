## 1. Schema

- [x] 1.1 Add optional `activeRange: FrameRangeSchema` to `SceneSchema`
      (`packages/shared-schema/src/scene.ts`); document the total-vs-active split
- [x] 1.2 Export an `activeRangeOf(scene)` helper that resolves
      `scene.activeRange ?? scene.frameRange` — the single place renderer + runtime
      resolve the window
- [x] 1.3 Leave `newScene()` / `ProjectStore` defaults unchanged (absent
      `activeRange` ⇒ full range; backward compatible with existing `.vcg`/scenes)

## 2. Store

- [x] 2.1 Add `setSceneActiveOut(outFrames)` — sets `activeRange.out`, clamped
      to `[activeRange.in + 1, frameRange.out]`, never touching `frameRange`
- [x] 2.2 Extend `setSceneDurationFrames` (the total setter) to clamp an
      existing `activeRange` into the new total
- [x] 2.3 Keep `setCurrentFrame` clamping to `frameRange` (total) so the full
      scene stays scrubbable past the active out-point

## 3. Timeline UI

- [x] 3.1 `TimelineDock` — ruler/grid keep spanning the total `frameRange`;
      compute the active-region percentage from the total span
- [x] 3.2 Scene bar spans the active region; the right gripper sits at
      `activeRange.out`; `startSceneResize` calls `setSceneActiveOut`
- [x] 3.3 Render a dimmed, non-interactive overlay over the trailing
      `[activeRange.out, frameRange.out]` region (frames stay visible/scrubbable)

## 4. Transport + runtime

- [x] 4.1 `TransportBar` play/loop/bounce bounded by `activeRangeOf(scene)`;
      readout keeps showing the total frame count
- [x] 4.2 `@cg/template-runtime` `FrameDriver` range → `activeRangeOf(scene)`
      (bounds playout and export)

## 5. Tests + gate

- [x] 5.1 `apps/designer/tests/store-scene-active-region.test.ts` — default full
      range, narrow without touching total, clamp in/out, fractional rounding,
      total-shrink clamps active, total-grow leaves active, full-scene scrub
- [x] 5.2 Green gate: `typecheck` + `lint` + `test` + `build` for
      `@cg/shared-schema`, `@cg/template-runtime`, `@cg/designer`
- [x] 5.3 `pnpm openspec validate add-scene-active-region --strict` passes
