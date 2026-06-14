# Tasks — multi-select-realtime-fields

## 1. Live multi-apply store action

- [x] 1.1 `state/slices/elements.ts`: add a live multi-apply action
      `applySharedPropertyLive(ids, property, value)` that fans
      `writeStaticAnimatable` over the ids with NO `runAsSingleHistoryEntry` (live
      writes time-coalesce). Keep the boundary-wrapped `applySharedProperty` for
      discrete commits (colour / gradient)

## 2. Re-enable drag + realtime on the multi number fields

- [x] 2.1 `controls.tsx`: `RealtimeNumberInput` — drop `commitMode` + the deferred
      branches (visual-only onChange, blur-commit, `discardRef`, buffer-only arrow
      nudge); add an `onCommitBoundary` callback fired on blur (Enter blurs) and in
      the input's own scrub `onEnd`
- [x] 2.2 `controls.tsx`: `ScrubOpts` + `scrubHandle` / `fieldScrub` gain
      `onCommitBoundary`, fired from `runScrubGesture`'s `onEnd` (pointerup);
      `NumberField` — drop `deferCommit`, always render the scrub surface, forward
      `onCommitBoundary`
- [x] 2.3 `transform-fields.tsx`: `FieldProps` — drop `deferCommit`, add
      `onCommitBoundary`; `FieldBody` forwards it (no `commitMode`); `Seg` /
      `SingleField` always render the scrub surface and pass `onCommitBoundary` into
      `fieldScrub`
- [x] 2.4 `MultiSelectSection.tsx`: route number-field `onCommit` →
      `applySharedPropertyLive`; pass an `onCommitBoundary` that calls
      `markHistoryBoundary` on every number field (transform + non-transform);
      colour / fill keep `applySharedProperty`; update the doc comment to the live +
      boundary-on-commit model

## 3. Tests

- [x] 3.1 Unit (store) `multi-select.test.ts`: a simulated multi drag (leading
      boundary, several live applies, trailing boundary) collapses to ONE undo
      reverting all selected; live calls update all selected DURING the gesture
      (before the trailing boundary); one undo reverts the whole burst (not just the
      last tick → no per-tick spam); a mixed-value selection applies live and one
      undo restores each element's differing original; keyframe-free (no animation
      track); `applySharedProperty` (discrete) and single `commitAnimatable` still
      one undo (regression)
- [x] 3.2 Unit (jsdom render) `multi-select-inspector.test.ts`: REPLACE the D-050
      "visual-only until blur" test — a typed edit now updates EVERY selected element
      LIVE on keystroke, and a single boundary on blur makes it ONE undo across all
      (Escape ends editing without a separate discard)
- [x] 3.3 E2E `multi-select.spec.ts`: select two shapes → DRAG a shared number field
      → both update live during the drag → release → ONE undo reverts both; type into
      a shared field → live update → Enter → one undo. Run via `pnpm test:e2e` (turbo
      builds first — never a stale dist)

## 4. Docs + gate

- [x] 4.1 Doc-sync: `state/README.md` (the new `applySharedPropertyLive` action +
      the boundary-on-commit model; supersede the D-050 `commitMode='blur'` note) and
      the inspector note describing the multi number field
- [x] 4.2 Full green gate (format:check + typecheck + lint + test + build), test task
      uncached once (`turbo --force`);
      `pnpm openspec validate multi-select-realtime-fields --strict`
