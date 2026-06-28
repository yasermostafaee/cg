# Tasks — content-driven nested composition drives the parent's hold (B-031)

## 1. Runtime — aggregate a coordinator child's self-settle

- [x] Add `ScopeNode.whenSettled(): Promise<void>` — a reset-safe settled deferred
      resolved in the non-root `onSettle` (after the scope's outro), alongside
      `stopScopeContent`.
- [x] Add `aggregateContentWait(ownWait, instanceChildren)`: own wait + per child,
      EITHER recurse `contentTreeWait` (non-coordinator) OR push `child.whenSettled()`
      (content-driven / coordinator). `contentTreeWait` + the inline `waitForContent`
      both delegate to it (remove the `if (!child.isCoordinator)` skip).
- [x] Keep `startContentTree` skipping coordinators (they self-start — no double-start).

## 2. Runtime tests

- [x] `nested-content-lifecycle.test.ts`: a content-driven parent holds for a
      content-driven nested child until it self-settles; `drivesHold:false` on the
      nested content opts it out (parent settles before the excluded content would).
- [x] `ticker-runtime.test.ts`: rewrite the "finite root self-settle past a nested
      infinite content-driven child" test — that scenario now HOLDS until `stop()`.
- [x] Confirm the manual-parent + depth + non-coordinator tests still pass (a manual
      parent never aggregates; non-coordinators recurse as before).

## 3. Preview — offer content-driven for nested-only content

- [x] Replace the shallow `hasOtherContentIn` with `hasAnyContentIn(doc, scene)`
      recursing nested composition instances (cycle-guarded), per-scope `hasContent`.
- [x] `PreviewScopeTiming` gates the content-driven hold offer on `node.hasContent`;
      per-ticker rows stay the scope's OWN tickers.
- [x] `preview-scope-timing.test.ts`: a nested-only parent is `hasContent: true`; a
      static nest is `false`.
- [x] Designer E2E (`nested-content-drives-parent-hold.spec.ts`): the preview offers
      the content-driven hold source for a parent whose only content is nested.

## 4. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for
      `@cg/template-runtime` and `@cg/designer` (turbo `--force` once).
- [x] `pnpm test:e2e` (the new spec + adjacent playout specs on the built `dist/`).
- [x] `pnpm openspec validate nested-content-drives-parent-hold --strict`.
- [x] Conventional commit + push; set B-031 `[~]` and note the change dir. Do NOT
      archive (the user confirms after merge).
