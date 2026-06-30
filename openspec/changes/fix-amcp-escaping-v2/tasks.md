# Tasks — AMCP escaping take 2 (B-041)

## 0. Investigation + design (THIS change — docs only)

- [x] Byte-level trace of the current (post-#245) path proving the bridge emits
      backslash-n, not a raw newline (`design.md`).
- [x] Diagnosis: CasparCG 2.3.x un-escapes `\n`→raw newline (disproves #245's
      "backslash literal" assumption); `"`/`\` also fail; the exact rule is not
      derivable on paper (two conflicting data points) → escape-matrix harness.
- [x] `proposal.md` + `specs/runtime-caspar-bridge/spec.md` (MODIFIED) + this plan.
- [x] B-041 PRD entry extended with the v2 findings; B-041 stays `[~]`.
- [x] `pnpm openspec validate fix-amcp-escaping-v2 --strict` + `format:check`.
- [ ] Review the diagnosis (operator) BEFORE implementation.

## 1. Escape-matrix hardware harness (follow-up — after review)

- [ ] Extend `tools/caspar-amcp-probe` to sweep candidate AMCP escapings of a fixed
      payload (`"`, `\` ×1–4, newline, tab, combos, Persian) against real CasparCG
      2.3.2, recording per candidate whether the template's `window.update` value
      `JSON.parse`s byte-exact to the original. The winning candidate is the rule.

## 2. Implement the empirical rule (follow-up)

- [ ] `@cg/caspar-client escape()`: the single canonical quoter = the empirical
      inverse of CasparCG's un-escape (backslash-aware; never emits raw `0x0A`/`0x0D`).
- [ ] `command-builder`: route both `CG ADD` + `CG UPDATE` data args through it once
      (unchanged structure).

## 3. amcp-mock decodes by the REAL rule + rejects framing/JSON-breakers (follow-up)

- [ ] `tools/amcp-mock amcp-parser.ts readQuoted`: decode per the confirmed real
      CasparCG rule (NOT the inverse of our escaper).
- [ ] Reject / flag a decoded data argument containing a raw control char or that
      fails `JSON.parse`, so the mock catches THIS class.

## 4. Tests (follow-up — full char + control-char matrix)

- [ ] Canonical-quoter unit: exact bytes + round-trip under the confirmed rule for
      `"`, `\` ×1–4, newline, tab, combos, Persian.
- [ ] Mock-decode: catches a raw-newline / un-parseable payload.
- [ ] Bridge → amcp-mock end-to-end: the whole matrix round-trips byte-exact
      (`JSON.parse` equals the original).
- [ ] Full green gate uncached for the touched workspaces.

## DO NOT close B-041

Implement only after the diagnosis is reviewed; then hardware-validate the matrix on
real CasparCG 2.3.2 (type `"`, `\`, and a newline → Update → applies on air, Persian
intact). B-041 flips to `[x]` only after that.
