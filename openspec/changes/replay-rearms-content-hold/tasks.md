# Tasks — replay re-arms the content-driven hold (B-033)

## 1. Runtime

- [x] Make the per-scope `settled` deferred re-mintable; add `ScopeNode.resetSettled`.
- [x] `play()` re-arms every scope's settle signal (`rootNode` + children) BEFORE the controller
      cascade.

## 2. Tests

- [x] Runtime (`replay-rearms-content-hold.test.ts`): reset+replay a content-driven scene asserts the
      hold re-arms (waits again on the 2nd play) — OWN content (regression guard) AND a nested
      CONTENT-DRIVEN child (the bug).
- [x] Preview E2E (`replay-rearms-content-hold.spec.ts`): play, let it settle, play again — the
      graphic is still holding shortly after the 2nd play (not closed instantly).

## 3. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/template-runtime` +
      `@cg/designer` (turbo `--force`).
- [x] `pnpm test:e2e` (the new spec).
- [x] `pnpm openspec validate replay-rearms-content-hold --strict`.
- [x] Conventional commit + push + verify remote head; B-033 `[~]`. Do NOT archive.
