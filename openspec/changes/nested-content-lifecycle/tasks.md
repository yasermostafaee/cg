# Tasks — nested-composition content lifecycle (D-104)

## 1. UI (a) — offer the hold control for nested content

- [ ] `hasContentElement` (`PlayoutSection.tsx`) recurses into `composition`
      element instances: resolve `scene.compositions` by `compositionId`, walk the
      referenced composition's layers' children, with a visited-set cycle guard
      (mirrors the existing `container` recursion).
- [ ] Verify the hold-source `Select` is offered for a parent whose only finite
      content is inside a nested composition.

## 2. Runtime (b)+(c) — aggregate + gate start

- [ ] `wireScope` computes `isCoordinator` from the effective playout and threads
      `hasCoordinatorAncestor` (reset to `false` at every `wireScopeSubtree`).
- [ ] Factor `startOwnContent()` + `ownContentWait()`; add `ScopeNode`
      `isCoordinator` / `startOwnContent` / `ownContentWait` / `instanceChildren`.
- [ ] Add `startContentTree(node)` + `contentTreeWait(node)` (own + non-coordinator
      instance-descendants; skip coordinator descendants).
- [ ] Wire controller `onHoldStart` / `waitForContent` per the coordinator rule;
      keep the root `contentHold` override and the hold-token guards.
- [ ] Keep repeater rows / sequence composition-items independent (separate
      subtrees; not in `instanceChildren`).

## 3. Tests

- [ ] Reframe `ticker-runtime` "finite root self-settle" to a content-driven
      (coordinator) nested comp (scenario still passes under the new rule).
- [ ] New: coordinator parent + non-coordinator nested finite content → parent
      holds until the nested content completes, then plays out.
- [ ] New: nested content starts at the parent's hold-start (after the parent's
      intro), not at play.
- [ ] New: non-coordinator nested INFINITE content → parent holds until `stop()`.
- [ ] Regression: a composition (incl. main) with DIRECT content is unchanged;
      a content-driven nested comp still self-settles; a repeater row's hold is
      still the row's (parent untouched).
- [ ] Designer E2E: the hold-source control is offered when content lives in a
      nested composition (acceptance bullet 1, UI).

## 4. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for
      `@cg/template-runtime` and `@cg/designer` (turbo `--force` once).
- [ ] `pnpm openspec validate nested-content-lifecycle --strict`.
- [ ] Conventional commit + push; set D-104 `[~]` (done) and note the change dir.
