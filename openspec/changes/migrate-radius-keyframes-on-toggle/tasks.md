# Tasks — migrate-radius-keyframes-on-toggle (B-015)

## 1. Timeline-slice track-copy primitive (@cg/designer)

- [x] 1.1 Add `copyKeyframeTrack(elementId, from, to)` to `state/slices/timeline.ts`:
      deep-clone each keyframe via `{ ...k, id: freshKeyframeId() }` (preserves
      stacked keyframes + per-keyframe easing/bezier), write as `tracks[to]`; no-op
      when `from` has no track. Use `mutateAnimation`.

## 2. Migrate on toggle (@cg/designer — StyleSection.tsx)

- [x] 2.1 `toPerCorner`: wrap in `runAsSingleHistoryEntry`; set static `[u,u,u,u]`;
      copy `cornerRadius` keyframes into all four `cornerRadius.tl/tr/br/bl`; clear
      the uniform `cornerRadius` track. No uniform keyframes → static spread only.
- [x] 2.2 `toUniform`: set static `corners[0]`; clear any stale uniform track; copy
      `cornerRadius.tl` → `cornerRadius` (top-left is the unconditional representative
      — lossless iff the four corners are identical); clear the four sub-tracks. Stay
      one undo. No separate equality check (it would be dead code).
- [x] 2.3 Dangling selection is reset by reusing `clearKeyframeTrack`, which already
      drops selection refs to the removed track (uniform on toPerCorner; the four
      corners on toUniform) — no extra code.

## 3. Doc-sync

- [ ] 3.1 Rewrite the D-042 docstring at `StyleSection.tsx` (the
      "Collapsing back to uniform drops the per-corner keyframe tracks" comment) to
      the new migrate semantics.
- [x] 3.2 `state/README.md`: document the new `copyKeyframeTrack` action.

## 4. Tests

- [x] 4.1 Unit `box-radius-migration.test.ts`: (1) uniform→per-corner copies value +
      keyframes into all four tracks, uniform track cleared, four tracks equal-by-value
      with DISTINCT ids; (2) uniform→per-corner with no keyframes → static tuple only,
      no tracks; (3) per-corner→uniform all-identical → keeps value + keyframes on
      `cornerRadius`, sub-tracks gone; (4) per-corner→uniform differing → top-left on
      `cornerRadius`, other three dropped; (5) easing + bezier survive both directions;
      (6) the B-015 round-trip asserted to the Option-2 result (TL survives collapse);
      (7) one undo restores the pre-toggle state for both directions; (8)
      `selectedKeyframe` referencing a dropped corner is cleared.
- [x] 4.2 E2E `box-props.spec.ts`: uniform-with-keyframe → toggle → four diamonds
      appear; round-trip asserts the Option-2 outcome. Aria-labels/selectors stable.
- [x] 4.3 Runtime `animation-applier.test.ts`: post-migration recomposed
      `border-radius` correct — four-value while sub-tracks exist; single value after
      collapse (guards the track-presence mode switch).

## 5. Green gate + validate

- [x] 5.1 `pnpm turbo run typecheck lint test build --filter @cg/designer --filter @cg/template-runtime --force` (uncached) + `pnpm format:check` (format:check is a separate root script, not a turbo task).
- [x] 5.2 E2E suite (`pnpm test:e2e`).
- [x] 5.3 `pnpm openspec validate migrate-radius-keyframes-on-toggle --strict`.
