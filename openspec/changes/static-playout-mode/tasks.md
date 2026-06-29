# Tasks — `static` playout mode (D-114)

## 1. Schema (`@cg/shared-schema`)

- [x] Add `static` to `PlayoutModeSchema` (non-breaking).
- [x] Widen `playoutOf` to `Pick<Scene, 'playout' | 'lifecycle'>`; resolve no-out-point ⇒
      `mode: 'static'` (resolve-on-read, non-destructive).
- [x] Schema/`playoutOf` tests: `static` parses + round-trips; `playoutOf` returns `static` with no
      lifecycle, the stored mode with one.

## 2. Runtime (`@cg/template-runtime`)

- [x] `playout-controller.ts` — `onIntroEnd` freezes for `static` (like `manual`); `startOutro` plays
      an EMPTY outro for `static` (clean cut). `static` not `cyclic()`.
- [x] Controller tests: `static` holds, doesn't loop; `stop()` cuts with no outro (immediate settle).

## 3. Designer state (`@cg/designer`)

- [x] `document.ts setLifecycle(null)` — flip the D-113 revert from `manual` to `static` (one
      atomic action; one-directional). No `→manual` remnant left.
- [x] `store-lifecycle.test.ts` — D-113 tests now expect `static`.

## 4. Designer UI

- [x] `PlayoutSection.tsx` — `MODE_LABELS` adds `static`; the mode `<Select>` disables
      `manual`/`auto-out`/`loop-cycle` when no out-point and disables `static` when one exists;
      hold-source + hold-ms rows hide for `static`; hints mention `static`.

## 5. Spec + docs

- [x] `## MODIFIED` the modes requirement (+ `static`); REMOVED/ADDED the clear-revert (→ static) on
      `designer-playout-lifecycle`.
- [x] `openspec validate static-playout-mode --strict`.

## 6. Real-fixture verification + gate

- [x] A `.vcg` / scene fixture with a NO-out-point composition: assert cut-on-stop, no outro (the
      controller resolves it to `static`).
- [x] Update the `outpoint-clear-reverts-mode` E2E to expect `static`.
- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/shared-schema` +
      `@cg/template-runtime` + `@cg/designer` + `@cg/vcg-format` (turbo `--force`); `pnpm test:e2e`.
- [x] Conventional commit; D-114 PRD `[~]`. Do NOT archive.
