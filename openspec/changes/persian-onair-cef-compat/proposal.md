# B-066 — CEF-incompatible `replaceAll` aborts template boot on real CasparCG (Persian templates don't air; `update`/`play` undefined and "????" are downstream)

## Why

Found live via the D-119 starter-template work — a **hard blocker for
D-119** (Persian starter templates): no Persian template airs on real
CasparCG today. Three observed symptoms, ONE root cause (confirmed by a
parallel trace on the Designer track and by this change's tests):

`packages/template-runtime/src/bindings.ts` calls
`String.prototype.replaceAll` — Chromium 85+, absent in CasparCG's CEF.
`createRuntime()` applies the scene's field DEFAULTS through that binding
walk during construction, so on CEF the template script **aborts at
boot**. Everything else cascades from that one throw:

- CEF logs "update is not defined" / "play is not defined" on `CG ADD`:
  the served boot runs `createRuntime()` BEFORE `installCasparGlobals()`,
  so the bare CasparCG entrypoints are never installed after the throw.
  (`installCasparGlobals` itself correctly defines
  `window.play/update/stop/next`.)
- Persian shows as "????": nothing rendered at all — the payload path is
  NOT at fault. Every UTF-8 hop was verified clean (`.vcg` unpack
  `TextDecoder`; browser WebSocket text frames; bridge `data.toString()`;
  Node socket write default UTF-8 — `setEncoding` is read-side only), and
  the B-041 matrix already proves Persian byte-exact through the wire.

The bundler was NOT wrong about syntax: the IIFE already targets
`chrome71` (CasparCG 2.3 LTS, the repo's declared CEF floor) — but esbuild
`target` lowers SYNTAX only; built-in METHODS pass through, which is
exactly the class this change now guards against.

## What Changes

- **The fix**: `bindings.ts` placeholder replacement moves to a
  CEF-71-safe `split(placeholder).join(value)` — exact literal
  replace-all semantics, regex-special characters inert by construction.
- **The audit**: both emitted bundles (our sources AND bundled deps, zod
  included) scanned against the post-Chromium-71 built-in list —
  `replaceAll` was the ONLY offender.
- **Durable guard, two layers + belt-and-suspenders**:
  1. A **bundle-compat test** in `@cg/single-file-export` scans BOTH
     emitted bundle artifacts (the exact strings CasparCG loads) for the
     curated banned list (`replaceAll`, `.at`, `findLast(Index)`,
     `Object.hasOwn`, `structuredClone`, `Object.fromEntries`,
     `Promise.allSettled/any`, `matchAll`, …) — catches offenders in
     bundled DEPENDENCIES that lint can't see.
  2. A **compat lint** (`no-restricted-syntax` selectors in
     `@cg/eslint-config`, applied to the CasparCG-facing source packages
     `@cg/template-runtime` + `@cg/shared-schema`) flags the same banned
     methods at the offending source line in dev. Chosen over
     eslint-plugin-compat (it checks Web APIs, not ES built-ins — see
     design.md §4).
  3. Every CasparCG-facing esbuild target pinned to `chrome71` for SYNTAX:
     the `.vcg`'s `cgJs` (was es2022) and `tools/template-fixtures`
     (was es2022) join the IIFE, which already was. (The brief's
     `apps/designer/scripts/bundle-runtime.mjs` does not exist — the
     Designer consumes `@cg/single-file-export`'s bundles; that bundler
     plus the fixtures builder are the complete set.)
- **Cascade verified + boot hardened**: a test deletes
  `String.prototype.replaceAll` (faithful CEF emulation), runs the served
  page's exact boot sequence, and asserts NO throw, the bare entrypoints
  defined, and a simulated CasparCG `update(json)` rendering Persian. The
  single-file boot also gains the fixtures' `try/catch` + visible
  "cg boot error" `<pre>` so any future boot failure is SEEN on air
  instead of a silent blank + a mystifying "update is not defined". The
  verb sequence is untouched: `CG ADD`/`CG PLAY`/`CG UPDATE` stays
  (ADR-0006 hardware-validated; `CG INVOKE`/`CALL` were
  hardware-DISPROVEN and are NOT adopted).
- **UTF-8 integrity locked by test** (closing the one uncovered segment,
  no fix needed): a real packed `.vcg` with Persian field defaults keeps
  exact codepoints through unpack/delivery (`apps/runtime`), and a Persian
  default loaded through the bridge lands in the mock-decoded `CG ADD`
  payload byte-exact with ZERO "?" (`tools/caspar-bridge`).
  `quote()`/the B-041 escape rule untouched (frozen).

## Capabilities

- `runtime-onair-cef-compat` (NEW capability — the CEF baseline + compat
  guard, the boot/entrypoints visibility contract, and field-payload UTF-8
  integrity).
- Ordering: the held `fix-amcp-escaping-v2` / `reconnect-reconciliation`
  deltas' owned requirement headings — especially "Template resolution is
  validated" and the escape-rule clauses — are untouched; this change's
  delta is ADDs of new headings in a brand-new capability, so it archives
  ordering-independent of that pair.

## Impact

- `packages/template-runtime` (bindings fix + tests),
  `packages/single-file-export` (boot try/catch + error pre; `cgJs`
  target; bundle-compat test), `tools/template-fixtures` (target),
  `packages/eslint-config` (cef-compat rules) + consuming lint configs,
  `apps/runtime` (Persian delivery test), `tools/caspar-bridge` (Persian
  `CG ADD` decode test).
- Filed as **ONE bug, B-066** (next free on merged main — B-065 was taken
  by #286; no Designer-track branch claims B-066), with the
  entrypoints-undefined and "????" symptoms recorded as downstream
  effects, per the owner's direction.
- Frozen (behavior unchanged, verified): `quote()`/B-041 escape rule; the
  `CG ADD`/`PLAY`/`UPDATE` verb sequence (ADR 0006); B-044;
  reconnect-reconciliation; R-003; R-009; R-010; B-056. (R-011 is not on
  `main` and not in this branch.)
- CEF/CasparCG-specific — LIVE CONFIRMATION on the owner's real CasparCG
  is the true gate; the PR ships tests-green with the checklist in the PRD
  entry. This unblocks the D-119 re-test once merged to main.
