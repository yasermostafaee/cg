# Tasks — `add-page-rebuild` (`C-034`)

## 1. §0 — read first

- [x] 1.1 Where Import bakes, what was kept, where the store lives, how the `.vcg` is checked
      (design.md §0.1–§0.3)
- [x] 1.2 Whether a rebuild can avoid weakening the check: yes, by keeping the verified bytes
      themselves and re-running the same `verify` (design.md §0.4)

## 2. Contracts (`cec75cfa`)

- [x] 2.1 `PageBuildSchema`, `TEMPLATE_SOURCE_MAX_BYTES`; `templates.import` gains `build` and
      `sourceSha256`
- [x] 2.2 `templates.source.put`, `templates.source.get`, `templates.rebuild-plan`,
      `templates.rebuild`
- [x] 2.3 Audit action `template-rebuild` and its `rebuild` detail; `rebuildClause` /
      `rebuildDetail`, in the Log's search words
- [x] 2.4 `pageRuntimeBuild` + `EXPORTER_SHELL_REVISION`, the shell pinned by a test

## 3. CG Bridge (`cec75cfa`)

- [x] 3.1 The registry keeps packages (`template-sources/`), stamps records, and collects unnamed
      packages after a grace
- [x] 3.2 `rebuildPlan` — rebuild / re-import, never a newer builder's page, never a failed one again
- [x] 3.3 `rebuild` — a new version at a new serve key; held back while `#mayBeOnALayer`;
      `settleRebuilds` on every row change, removal and settled ADD
- [x] 3.4 Routes, channel scopes, the three route censuses; one audit row per rebuild, as the
      console that built it (`captureActorContext` / `runAsCaptured`)

## 4. CG Control (`2091dec6`)

- [x] 4.1 The import keeps the verified package and stamps the runtime
- [x] 4.2 The rebuild pass on connect (`useTemplateRebuild`, `runRebuildPass`): hash check, the
      import's own bake, one confirmation and one refusal per pass
- [x] 4.3 The Library's one re-import line; the Log's rebuild clause

## 5. Tests

- [x] 5.1 `tools/caspar-bridge/tests/template-rebuild.test.ts` — the import keeps its inputs
      (across a restart); a package the store lacks is not referenced; the size cap; the package
      sweep; the plan (once per template, legacy listed, newer builder left alone); a rebuild
      swaps at a new path; held back while busy, swapped when free; a failure kept, not
      re-offered, listed; stale answers change nothing
- [x] 5.2 `tools/caspar-bridge/tests/template-rebuild.integration.test.ts` — on air: held back;
      stopped (`RUN-NEXT-VERSION-02` Q11, which superseded "stopped: held back; cleared: swapped
      in"): swapped in at a new path, the stopped page untouched and still served, one audit row;
      after a Clear the next take's `CG ADD` loads it. Ablated (`#mayBeOnALayer` always free): red;
      the old predicate (`loaded` holds back): red at the stopped step
- [x] 5.3 `apps/runtime/tests/template-rebuild.test.ts` — the verified bytes are the ones kept;
      a bridge that refuses keeps nothing; the pass rebuilds through the import's path; a
      tampered package fails `verify` and is reported, never built; a hash mismatch is
      refused; the operator's sentences
- [x] 5.4 `apps/runtime/tests/templatePicker.reimport.dom.test.ts` — the line, its names and
      no ids; no line when nothing is owed; a bridge without the read shows none
- [x] 5.5 `packages/single-file-export/tests/page-build.test.ts` — the fingerprint, and the shell
      pinned beside its revision
- [x] 5.6 `apps/runtime/tests/e2e/page-rebuild.spec.ts` — a real in-process bridge: on connect
      the console rebuilds the kept page (one audit row, a new path), and the Library names
      the legacy template once. Local Windows: 1 passed
- [x] 5.7 Linux `e2e` RAN on the commit carrying the change —
      [38637675128](https://github.com/yasermostafaee/cg/actions/runs/38637675128) (`9dc3d615`,
      which carries `cec75cfa` and `2091dec6`): `ci` and the `E2E` step RAN and completed green —
      Runtime 344 passed / 2 skipped, `page-rebuild.spec.ts` among them; Designer 318 passed / 13
      skipped / 1 flaky (`clock.spec.ts:14`, a wall-clock tick, passed on retry; not touched by
      this change). Read from the run log
- [x] 5.8 Linux `e2e` RAN on the commit carrying `RUN-NEXT-VERSION-02` Q11 (`d3c07ca4`: a stopped row lets the
      rebuild through; the confirmation's wording)
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `d3c07ca4`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); the whole suites, `page-rebuild.spec.ts` among them.

## 6. Docs

- [x] 6.1 `C-034` marked `[~]` in `docs/prd/caspar.md`, its acceptance replaced by what was built
- [x] 6.2 Engine doc: `docs/engines/overview.md` — the template delivery pipeline keeps its
      package and rebuilds
