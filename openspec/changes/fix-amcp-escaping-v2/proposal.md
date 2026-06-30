# AMCP escaping take 2 — evidence-grounded fix (B-041)

## Why

PR #245's quotes-only escaping is **confirmed wrong on real CasparCG 2.3.2**.
Hardware evidence (updating field `ttt` to `New text␊second text`):

```
Received: CG 1-60 UPDATE 0 "{\"ttt\":\"New text␊second text\"}"   → 202 CG OK
html[...] Uncaught SyntaxError: Invalid or unexpected token
```

A byte-level trace of the current code (see `design.md`) proves the bridge emits the
newline as **backslash-n** (two chars) — it does NOT put a raw newline on the wire.
Yet the template's `JSON.parse` sees a **raw newline inside the JSON string** →
SyntaxError. The only layer in between is CasparCG, so:

> **CasparCG 2.3.x un-escapes `\n` (backslash-n) → a raw newline (`0x0A`).**

This **disproves #245's assumption** that CasparCG keeps backslashes literal (only
`\"` escaped). CasparCG actively processes backslash escapes, so a bare backslash-n
is mangled. `"` and `\` (odd) also still fail under #245.

The original double-escape (pre-#245) ALSO failed (DP1), and no single hand-derived
un-escape model satisfies BOTH data points — so the exact rule is **not derivable on
paper**. Per the plan agreed when the analytical fix was attempted, we pivot to an
**escape-matrix hardware harness** to determine the rule empirically, then implement
that exact inverse.

## What Changes

This change is **investigation + design only** (no code) — the diagnosis and the
corrected approach for review before implementation:

- **Diagnosis:** the concrete byte-level trace + the proof that CasparCG un-escapes
  `\n`→raw newline (so the escaping must be backslash-aware, NOT quotes-only).
- **Planned fix (follow-up):**
  1. An **escape-matrix harness** (`tools/caspar-amcp-probe`) that sweeps candidate
     AMCP escapings of a `"` / `\`×1–4 / newline / tab / Persian payload against real
     CasparCG 2.3.2 and records which one the template's `JSON.parse` accepts
     byte-exact — the empirical rule.
  2. The winning escaping as the **single canonical quoter** (`@cg/caspar-client
escape()`), applied once by `command-builder` to both `CG ADD` + `CG UPDATE`.
  3. **amcp-mock** decoding by the **real** CasparCG rule (not the inverse of our own
     escaper) AND **rejecting raw control chars** / surfacing a payload that fails
     `JSON.parse` — so the mock catches this class (a raw newline reaching the
     template), which it currently does not.
  4. Full character + control-character matrix tests.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED — the AMCP seam): the canonical quoter must
  produce a data argument that, after CasparCG 2.3.x's actual un-escape (which
  converts `\n`→newline and processes backslash escapes), reproduces the original JSON
  string byte-exact at the template's `JSON.parse` — for `"`, `\` (odd + even), and
  newline. The exact escaping is hardware-matrix-validated; the mock decodes by that
  real rule and rejects framing/JSON-breaking payloads.

## Impact

- This change: docs only (diagnosis + design); B-041 stays `[~]`.
- Follow-up (separate change): `tools/caspar-amcp-probe` (matrix harness),
  `@cg/caspar-client` `escape.ts`, `tools/amcp-mock` (`amcp-parser` + control-char
  rejection), tests. PR #245's quotes-only escaping is superseded.
- B-041 closes only after on-hardware matrix validation.
