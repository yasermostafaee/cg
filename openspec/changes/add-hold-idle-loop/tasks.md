## 1. Schema

- [ ] 1.1 Add optional `holdLoopStart` to the composition lifecycle in
      `packages/shared-schema/src/scene.ts`, validating
      `activeRange.in ≤ holdLoopStart ≤ outPoint` (absent = D-020 frozen hold)

## 2. Runtime

- [ ] 2.1 `playout-controller.ts` — when `holdLoopStart` is set, the HOLD phase
      loops `[holdLoopStart → outPoint]` (after the entrance plays once in full)
      instead of freezing; reuse `frame-driver.ts`'s loop mode bounded to that
      sub-range
- [ ] 2.2 Compose with timing modes: `manual` loops until `stop()`; `auto-out`
      loops for `holdMs` then exit; `loop-cycle` loops during each cycle's hold;
      `stop()` during the idle plays the exit `[outPoint → activeRange.out]`

## 3. Designer UI

- [ ] 3.1 `features/timeline/*` — optional `holdLoopStart` marker, invariant
      enforced against `outPoint` (reuse D-020 marker handling)
- [ ] 3.2 Playout config — a "loop while holding" toggle; off by default; surface
      a seamless-cycle authoring hint
- [ ] 3.3 `platform/preview.ts` + preview modal — reflect the idle loop; allow
      toggling/testing it

## 4. Export

- [ ] 4.1 `packages/vcg-format` / `platform/ExporterSingleFile.ts` — carry
      `holdLoopStart` in the metadata block (no behavior change; scene already
      inlined)

## 5. Tests + gate

- [ ] 5.1 `shared-schema` — invariant enforced; absent `holdLoopStart` = frozen
      hold
- [ ] 5.2 `template-runtime` — hold loops the sub-range when set; entrance plays
      fully once before looping; auto-out / loop-cycle compose; stop during idle
      plays the exit
- [ ] 5.3 `apps/designer` — `holdLoopStart` marker store test (invariant); preview
      reflects the idle loop
- [ ] 5.4 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/vcg-format`, `@cg/designer`
- [ ] 5.5 `pnpm openspec validate add-hold-idle-loop --strict`
