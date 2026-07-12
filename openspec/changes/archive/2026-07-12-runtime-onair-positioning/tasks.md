# Tasks — runtime-onair-positioning (R-011)

## 1. Artifacts

- [x] Diagnosis (why 0,0), Option-A decision + MIXER rejection, query
      encoding, 1920×1080 reference + non-1080 residual, and the
      preview-vs-output gating verification in `design.md`.
- [x] `pnpm openspec validate runtime-onair-positioning --strict` passes.

## 2. Red-first tests

- [x] template-runtime unit (`output-position.test.ts`, seen red — import
      failed pre-implementation): 300×300 scene — query anchor+offset,
      `scene.defaultPosition`, centered fallback, invalid-token fallback,
      page-frame sizing; Designer-preview guard (`createRuntime` alone: no
      transform, no resize). 7/7 green post-implementation.
- [x] bridge integration (`onair-position.integration.test.ts`, seen red —
      `setPosition is not a function`, 3/3 failed): no override → no
      query; set-position on loaded → re-ADD with query, still resolves;
      take-after-out re-ADD carries the SAME query; setConfig → override
      survives; on-air set-position → refused; idle set-position stores
      only; removed item drops its override; sockets released
      deterministically. 3/3 green post-implementation.

## 3. Schema + runtime + exporter

- [x] `@cg/shared-schema`: `PositionAnchorSchema` + `PositionSchema`;
      `Scene.defaultPosition` optional (backward-compatible).
- [x] `@cg/template-runtime` `position.ts`: `OUTPUT_FRAME`,
      `parsePositionQuery`, `resolveOutputPosition`, `outputTranslate`,
      `applyOutputPosition` (sizes page to output frame + translates
      `.cg-stage`); exported from the package index.
- [x] `@cg/single-file-export` boot script: call
      `CG.applyOutputPosition(scene, { search: location.search })` after
      `installCasparGlobals` — the ONLY caller; the Designer preview never
      calls it.

## 4. IPC + bridge

- [x] `@cg/shared-ipc`: `stack.set-position`
      (`{itemId, position}` → `{ok, reason?: 'on-air'|'unknown-item'}`);
      schema tests.
- [x] `tools/caspar-bridge`: `#positions` map; `setPosition()` with the
      R-010 on-air predicate refusal, loaded-not-taken invisible re-ADD
      (non-intent seq), idle store; `#sendAdd` appends the query onto the
      RESOLVED served URL only (bare-id + serve-down contract
      byte-for-byte); `remove()` drops the entry; `setConfig` leaves the
      map alone; route in `bridge.ts`.

## 5. Runtime app

- [x] `templateDelivery.ts` surfaces `scene.defaultPosition`;
      renderer-side default-position registry keyed by templateId
      (populated at import; `TemplateInfo` untouched).
- [x] Contract (`runtime-bridge.ts`) + `WebSocketRuntime` +
      `createRuntimeBridge` wrapper + `MockRuntime` parity (on-air
      refusal, stored map).
- [x] `PositionPicker` in the Inspector: 3×3 anchor grid + offset inputs +
      Apply; seeds from the registry (centered fallback); locked with
      visible reason while on air/unsettled.
- [x] jsdom picker tests; Playwright e2e (`onair-position.spec.ts`):
      import a `.vcg` with `defaultPosition` → picker seeded; apply →
      exactly one `stack.set-position` (spy); take → locked; out →
      editable again. 22/22 runtime e2e green (forced uncached).

## 6. Gate

- [x] caspar-bridge suite green in ISOLATION (21 files / 79 tests) and
      under the full parallel `pnpm test` (both mandatory); full uncached
      `turbo run typecheck lint test build --force` (exit 0); root
      `pnpm format:check`.
- [x] `pnpm test:e2e` (full run): runtime 22/22 forced uncached incl.
      `onair-position.spec.ts`; designer 199/199 uncached. (One earlier
      designer run flaked 2–6 SHIFTING preview-timing tests under machine
      contention — an orphaned vite server from a prior session + this
      session's concurrent commands; killed the orphan, re-ran quiet →
      199/199. The failure set was disjoint across runs and each test
      passes in isolation; no R-011 code touches the preview path, which
      is regression-guarded by unit test.)
- [x] `pnpm openspec validate --all --strict` (34 passed).

## 7. Wrap-up

- [x] File R-011 in `docs/prd/runtime.md` as implemented +
      mock/integration/e2e-validated; live smoke PENDING hardware (real
      1920×1080 channel: small comp loads CENTERED with no override / at
      the chosen anchor+offset with one; Designer preview unchanged).
      Cross-ref D-119 (Designer half: auto-populate `defaultPosition`,
      small-comp export) and note the dependency. ROADMAP tracks no
      R-items (verified) — no update.
- [x] GUARDED pre-archive shared-spec ordering check PASSED (re-verified
      this session): held pair's owned headings (incl. "Template
      resolution is validated") untouched; all deltas are ADDs of new
      headings (one brand-new capability, zero living-spec collisions) →
      archived ordering-independent of the pair.
- [x] Conventional commits, push, PR, verify remote.
