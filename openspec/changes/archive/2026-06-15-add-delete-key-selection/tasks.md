## 1. Store

- [x] 1.1 `state/store.ts` — add `deleteSelection()`: if `selectedKeyframes` is
      non-empty delete all of them (snapshot first), else delete all `selection`
      elements via `removeElement`. No-op when nothing selected. Relies on the
      existing history coalescing so one gesture = one undo step.

## 2. Keyboard handler

- [x] 2.1 `App.tsx` — global Delete/Backspace handler: ignore when an
      `input`/`textarea`/`select`/contentEditable is focused; no-op when nothing is
      selected; `markHistoryBoundary()` then `deleteSelection()`.
- [x] 2.2 `features/timeline/TimelineDock.tsx` — remove the redundant keyframe-only
      Delete handler (+ its unused `isEditableTarget`); deletion is now the shared
      global path.
- [x] 2.3 `features/shell/ShortcutsModal.tsx` — update the Delete/Backspace label
      ("Delete selected keyframe(s), else selected layer(s)").

## 3. Tests + gate

- [x] 3.1 `apps/designer` store test — keyframe selected → keyframe deleted, layer
      kept; no keyframe + layer selected → layer deleted; multi-select deletes all
      of the prioritised kind; nothing selected → no-op; delete is one undo step.
- [x] 3.2 Green gate: typecheck + lint + test + build for `@cg/designer`.
- [x] 3.3 `pnpm openspec validate add-delete-key-selection --strict`.
