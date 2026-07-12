# Tasks — persian-onair-cef-compat (B-066)

## 1. Artifacts

- [x] design.md: causal analysis (the boot-abort cascade — one bug, three
      symptoms), the UTF-8 hop table (no encoding fix needed; "?" is
      downstream/display), the Chromium-71 baseline + why, the guard
      choices, and the explicit CG INVOKE-not-adopted note (ADR 0006).
- [x] `pnpm openspec validate persian-onair-cef-compat --strict` passes.

## 2. Red-first tests

- [x] Bundle compat scan (`@cg/single-file-export`): both emitted bundles
      contain zero banned post-71 built-ins — seen RED pre-fix
      (replaceAll ×2, one per bundle variant), green post-fix.
- [x] CEF-emulation boot cascade (`@cg/template-runtime`): with
      `String.prototype.replaceAll` deleted, boot a Persian-defaults scene
      (createRuntime → installCasparGlobals) — seen RED pre-fix with the
      EXACT live error ("original.replaceAll is not a function", thrown in
      createRuntime, installCasparGlobals never reached — the cascade
      proof); post-fix: no throw, bare globals defined, `update(json)`
      renders Persian. 4/4 green.
- [x] Bindings semantics: multi-occurrence literal replacement, a
      regex-special placeholder stays literal, and a value containing `$&`
      stays literal (the split/join path never expands replacement
      patterns).
- [x] Persian byte-exact end-to-end: `.vcg` Persian defaults →
      `produceTemplateDelivery` keeps exact codepoints (`apps/runtime`);
      bridge load → mock two-layer-decoded `CG ADD` has exact codepoints,
      zero "?" (`tools/caspar-bridge`); sockets released deterministically.
      Green immediately — the documented finding: every repo hop is
      UTF-8-clean; these are the regression nets.

## 3. Fix + hardening

- [x] `bindings.ts`: `replaceAll` → `split(placeholder).join(value)`.
- [x] Single-file boot script: try/catch + visible "cg boot error" `<pre>`
      (fixtures pattern); happy path byte-identical; verb sequence
      untouched (ADR-0006: CG ADD/PLAY/UPDATE; INVOKE/CALL stay rejected).

## 4. Durable guard

- [x] `@cg/eslint-config`: cef-compat rules (`no-restricted-syntax`
      selectors over the one curated banned list) — folded into the
      broadcast tier (`@cg/template-runtime`, `@cg/lottie-bridge`) and
      applied via `cefCompat()` in `@cg/shared-schema` (bundled into
      broadcast output). During rollout the rule caught a real `matchAll`
      in the exporter — correctly opted out with rationale (the exporter
      PRODUCES the CEF page; it runs in the apps' modern browsers; the
      artifact scan guards what actually ships).
- [x] esbuild targets pinned to `chrome71`: single-file-export `cgJs`
      (was es2022) and `tools/template-fixtures/build.mjs` (was es2022);
      the IIFE already was. (The brief's
      `apps/designer/scripts/bundle-runtime.mjs` does not exist — that
      stale path in `docs/engines/overview.md` is fixed in this change.)
- [x] Bundle-compat test wired into the normal test gate (imports the
      lint's canonical banned list from `@cg/eslint-config`).

## 5. Gate

- [x] caspar-bridge suite green in ISOLATION (21 files / 77 tests) and
      under the full parallel `pnpm test` — twice consecutively (one
      earlier parallel run flaked once and did not reproduce; both
      mandatory conditions met); full uncached
      `turbo run typecheck lint test build --force` 79/79; root
      `pnpm format:check` clean.
- [x] `pnpm test:e2e` (full run): runtime 21/21, designer 199/199.
- [x] `pnpm openspec validate --all --strict` (34 passed).

## 6. Wrap-up

- [x] File **B-066** (ONE bug — next free number on merged main; no
      Designer-track branch claims it) in `docs/prd/bugs-runtime.md` with
      the update/play-undefined and "????" symptoms recorded as downstream
      effects, the UTF-8 no-fix finding, and the LIVE-CONFIRMATION
      checklist (real CasparCG: no replaceAll error, no cg-boot-error pre,
      play/update defined, template renders, Persian correct; note the CEF
      version — expected ∈ [71, 84]).
- [x] docs: the durable lesson ("the served bundle must run on CasparCG's
      CEF, not a modern browser") + the corrected bundler path in
      `docs/engines/overview.md`; ROADMAP D-119 entry notes the B-066 gate
      and that the live re-test resumes once this merges.
- [x] GUARDED pre-archive shared-spec ordering check PASSED (re-verified
      this session): the held pair's six owned headings — incl. "Template
      resolution is validated" and the escape-rule seam — untouched; this
      delta is `## ADDED` only, three new headings in a brand-new
      capability (no living-spec collision) → archives
      ordering-independent of the pair.
- [x] Conventional commit, push, PR, verify remote; notify the owner the
      D-119 re-test is unblocked once merged to main.
