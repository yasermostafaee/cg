# Tasks — Correct AMCP string escaping (B-041)

## 1. Canonical quoter (single source of truth)

- [ ] `packages/caspar-client/src/amcp/escape.ts`: `escape()` escapes `"` → `\"`
      only; raw `\r`/`\n` → space (defensive); every other char (incl. `\`) literal —
      no backslash doubling. `quote()` wrapper unchanged. Rewrite the doc comment
      (CasparCG 2.3.x rule + JSON-payload rationale + input invariant).
- [ ] `tools/caspar-bridge/src/command-builder.ts`: confirm both `CG ADD` and
      `CG UPDATE` route the data arg through `quote(JSON.stringify(fields))` exactly
      once; update the comment (no more double-escape).

## 2. amcp-mock decodes per real CasparCG (independently)

- [ ] `tools/amcp-mock/src/amcp-parser.ts` `readQuoted`: un-escape **only** `\"`→`"`;
      every other char (incl. `\`) literal; unescaped `"` closes the token. Update the
      file comment (matches CasparCG 2.3.x, NOT the inverse of our escaper).

## 3. Tests (full character coverage)

- [ ] `escape.test.ts`: exact wire bytes for `"`, `\` ×1–4, newline, tab, combos,
      Persian; assert backslashes are NOT doubled.
- [ ] `amcp-parser` test: decoding the canonical output → original JSON; decoding the
      OLD double-escaped output is observably wrong (mock catches the regression).
- [ ] Bridge → amcp-mock end-to-end integration: a field value with `"`, `\` (odd AND
      even), and a newline survives `CG ADD` + `CG UPDATE`; mock decodes + `JSON.parse`
      → byte-exact original (Persian intact).

## 4. Gate

- [ ] Full green gate UNCACHED (`turbo … --force`) for `@cg/caspar-client`,
      `@cg/caspar-bridge`, `@cg/amcp-mock`, `@cg/runtime`: `format:check` +
      `typecheck` + `lint` + `test` + `build`.
- [ ] `pnpm openspec validate fix-amcp-escaping --strict`.
- [ ] Commit + push + open a PR. **B-041 stays `[~]`.**

## DO NOT close B-041

After merge, hardware-validate on real CasparCG 2.3.2: type `"`, `\`, and a newline
in a field, Update, confirm it applies on air (Persian intact). Only after that does
B-041 flip to `[x]`. The CasparCG un-quote rule is the empirical unknown — if the
principled single-escape is still off on hardware, pivot to an escape-matrix harness.
