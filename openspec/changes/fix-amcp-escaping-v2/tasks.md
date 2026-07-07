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
- [x] Review the diagnosis (operator) BEFORE implementation. — Approved by the
      operator 2026-07-07 (session-1 digest: every claim re-verified against
      current code with file:line evidence + a local byte-trace repro; upstream
      CasparCG source identified the two-layer un-escape pipeline — AMCP
      tokenizer + `html_cg_proxy` `update("…")` V8 embed).

## 1. Escape-matrix hardware harness (follow-up — after review)

- [ ] Extend `tools/caspar-amcp-probe` to sweep candidate AMCP escapings of a fixed
      payload (`"`, `\` ×1–4, newline, tab, combos, Persian) against real CasparCG
      2.3.2, recording per candidate whether the template's `window.update` value
      `JSON.parse`s byte-exact to the original. The winning candidate is the rule.

_Note (2026-07-07): the harness pre-existed (#247); this session added the two
two-layer-model candidates (operator pre-approved) and swept the local
`2.5.0 69e8ad5 Stable` — winner `js-escape+amcp-escape` (all 7 old candidates
fail, both new ones pass; see `design.md` → "Hardware sweep results"). The 2.5
pass is done; the 2.3.2 pass is pending and the harness is ready to re-run. The
box stays unticked because its text requires real 2.3.2._

## 2. Implement the empirical rule (follow-up)

- [x] `@cg/caspar-client escape()`: the single canonical quoter = the empirical
      inverse of CasparCG's un-escape (backslash-aware; never emits raw `0x0A`/`0x0D`).
- [x] `command-builder`: route both `CG ADD` + `CG UPDATE` data args through it once
      (unchanged structure).

## 3. amcp-mock decodes by the REAL rule + rejects framing/JSON-breakers (follow-up)

- [x] `tools/amcp-mock amcp-parser.ts readQuoted`: decode per the confirmed real
      CasparCG rule (NOT the inverse of our escaper).
- [x] Reject / flag a decoded data argument containing a raw control char or that
      fails `JSON.parse`, so the mock catches THIS class.

## 4. Tests (follow-up — full char + control-char matrix)

- [x] Canonical-quoter unit: exact bytes + round-trip under the confirmed rule for
      `"`, `\` ×1–4, newline, tab, combos, Persian.
- [x] Mock-decode: catches a raw-newline / un-parseable payload.
- [x] Bridge → amcp-mock end-to-end: the whole matrix round-trips byte-exact
      (`JSON.parse` equals the original).
- [x] Full green gate uncached for the touched workspaces.

_Note (2026-07-07): §2–4 implemented on branch `fix/B-041-escaping-implementation`
(layer-2 html_cg_proxy→V8 emulation in `tools/amcp-mock/src/cg-data.ts`; a parity
test pins `escape()` byte-for-byte to the winning `js-escape+amcp-escape` candidate
encoder) and **live-validated by the operator on the local CasparCG 2.5.0
(`69e8ad5`)**: quotes, `\`×1/×3, multi-line via Enter (incl. the original two-line
ticker items), mixed Persian/Latin — in a plain text field AND ticker list items,
via BOTH `CG ADD` (fresh Load+Take) and `CG UPDATE` (on-air Update) — render
exactly as typed with no `Uncaught SyntaxError`. B-041 stays `[~]`: §1's 2.3.2
pass is the only remaining gate._

## DO NOT close B-041

Implement only after the diagnosis is reviewed; then hardware-validate the matrix on
real CasparCG 2.3.2 (type `"`, `\`, and a newline → Update → applies on air, Persian
intact). B-041 flips to `[x]` only after that.
