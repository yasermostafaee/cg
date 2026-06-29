# Tasks — multi-line SEQUENCE item text (D-117)

## 1. Sequence render (`@cg/template-runtime`)

- [x] `sequence-driver.ts` `makeSequenceItemNode()` — `white-space: pre` → `pre-wrap`; add
      `max-width: 100%` (grid cell) + `overflow-wrap: break-word`. Box height + transition unchanged.
- [x] Ticker is OUT OF SCOPE — unchanged (single-line crawl).

## 2. Tests

- [x] Runtime unit (sequence): item node `pre-wrap` + `max-width`; `\n` preserved; RTL direction
      intact; single-line unchanged.
- [ ] Playwright E2E: a SEQUENCE item set with `\n` renders multi-line in the preview and its push-up
      transition still advances; include an RTL case; preview == export shape.

## 3. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/template-runtime` +
      `@cg/designer` (turbo `--force`).
- [ ] `pnpm test:e2e` (the new spec).
- [ ] `pnpm openspec validate multiline-sequence-items --strict`.
- [ ] Conventional commit; D-117 PRD `[~]`. Do NOT archive.
