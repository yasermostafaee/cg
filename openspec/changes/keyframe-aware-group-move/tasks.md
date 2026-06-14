# Tasks — keyframe-aware-group-move

## 1. Keyframe-aware group move (canvas)

- [x] 1.1 `CanvasOverlay.tsx` `beginGroupDrag`: swap the two per-member
      `writeStaticAnimatable('position.x' | 'position.y', …)` calls to
      `commitAnimatable(…)`. Change nothing else (leading/trailing boundaries and
      the evaluated-at-playhead `m.x`/`m.y` are already correct)

## 2. Keyframe-aware group field edits (Option B)

- [x] 2.1 `state/slices/elements.ts`: add `applySharedPropertyLiveKeyframed(ids, property, value)`
      — loop `commitAnimatable` over the ids with NO `runAsSingleHistoryEntry`
      (coalescing preserved). Report whether `applySharedPropertyLive` is still used
      by any field or fully superseded
- [x] 2.2 `MultiSelectSection.tsx`: route number-field `onCommit` to
      `applySharedPropertyLiveKeyframed`; keep the D-053 `onCommitBoundary`
      (drag-release / Enter / blur) so edits stay realtime + ONE undo

## 3. Diamonds in the multi inspector

- [x] 3.1 `KeyframeIndicator.tsx`: add a third variant `partial` (distinct colour)
      alongside `empty` / `at-frame`; single inspector never passes it (unchanged)
- [x] 3.2 `MultiSelectSection.tsx`: render a `KeyframeIndicator` per shared property
      that is keyframe-able for ALL selected kinds (gate via the D-051 registry
      `isKeyframeable`); aggregate variant: all keyframed at `currentFrame` →
      `at-frame`, none → `empty`, mixed → `partial`
- [x] 3.3 Add a multi diamond-toggle helper: wrap the existing
      `togglePropertyKeyframe` over the selection in ONE `runAsSingleHistoryEntry` —
      all have a keyframe → remove from all; else add to every member lacking one
      (evaluated-at-playhead, B-005-safe). Wire it to the diamond `onClick`

## 4. Do-not-touch (reuse-not-rewrite)

- [x] 4.1 Confirm (grep/diff) `commitAnimatable`, `togglePropertyKeyframe`,
      `upsertKeyframe`, the single-drag handlers, and D-053's single field path are
      byte-unchanged — only new callers added

## 5. Tests

- [x] 5.1 Regression backbone stays green UNCHANGED: existing single-drag,
      B-005/006/007, and D-053 realtime-group-field tests
- [x] 5.2 Group move keyframe-aware (store/unit): a 2-selection where A has a
      position.x track and B does not → A keyframes at the playhead (evaluated start + delta), B's base moves; one undo reverts both; locked/hidden skip preserved;
      multi-axis
- [x] 5.3 Field edit keyframe-aware (Option B): edit a shared field with A animated,
      B not → A keyframes at playhead, B base; live during the gesture and ONE undo on
      commit
- [x] 5.4 Diamonds: aggregate variant (all/none/partial → at-frame/empty/partial);
      fan-out toggle adds-to-missing then removes-all, each ONE undo; presence gated
      to all-selected-keyframe-able incl. a mixed-kind case (hidden when a kind can't
      keyframe it)
- [x] 5.5 E2E `multi-select.spec.ts`: two shapes, one with an X keyframe →
      group-drag → the animated one keyframes at the playhead, one undo reverts both;
      the multi inspector shows a diamond, `partial` when only one has a keyframe,
      click adds to both. Run via `pnpm test:e2e` (turbo builds first)

## 6. Docs + gate

- [x] 6.1 Doc-sync: `state/README.md` (the keyframed live action), the
      canvas/timeline/inspector READMEs (diamonds now in multi; the third variant;
      multi == single)
- [x] 6.2 Full green gate (format:check + typecheck + lint + test + build), test task
      uncached once (`turbo --force`);
      `pnpm openspec validate keyframe-aware-group-move --strict`
