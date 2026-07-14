# Tasks — rename the open project (D-127)

## 1. Store

- [x] 1.1 Add `renameProject(name: string)` to the document slice: trims the input; empty /
      whitespace-only is a no-op (previous name kept); a no-change name is a no-op; otherwise writes
      the SCENE-ROOT `name` via `set()` (never `updateScene`, whose `docKeys` would route `name` to
      the active composition).
- [x] 1.2 Document the trap in the slice comment so a future edit doesn't "simplify" it back to
      `updateScene({ name })`.

## 2. TopToolbar inline edit

- [x] 2.1 `renaming` state + a draft string in LOCAL component state; the project-name span swaps to
      a text `<input>` (vanilla-extract styled, layout-stable) while renaming.
- [x] 2.2 Double-click on the name enters edit mode, auto-focused with the current name SELECTED.
- [x] 2.3 Enter or blur commits via `designerStore.renameProject(draft)` — ONE store write, one undo
      entry; Escape cancels (no store write) and a subsequent blur must not commit.
- [x] 2.4 File menu gains a "Rename Project…" `FileMenuItem` (disabled with no project) that sets the
      same `renaming` flag — identical behavior to the double-click.

## 3. Tests

- [x] 3.1 Store test (`tests/store-rename-project.test.ts`): scene-root rename with a composition
      active (composition name untouched); empty/whitespace no-op; dirty marked; exactly one undo
      entry (undo restores the prior name).
- [x] 3.2 Component test (`tests/project-rename-toolbar.test.ts`, jsdom): double-click → focused input
      seeded + selected; Enter commits; blur commits; Escape cancels; empty commit rejected; File →
      "Rename Project…" activates the same edit.
- [x] 3.3 E2E (`tests/e2e/project-rename.spec.ts`): both entry points, Enter commit + tab title +
      SAVE enabled, Escape cancel, PROJECT-not-composition rename with a composition active.

## 4. Gate

- [x] 4.1 `pnpm --filter @cg/designer typecheck lint test build`
- [x] 4.2 `pnpm turbo run typecheck lint test build --force` + `pnpm format:check`
- [x] 4.3 `pnpm test:e2e`
- [x] 4.4 `pnpm openspec validate rename-open-project --strict`
