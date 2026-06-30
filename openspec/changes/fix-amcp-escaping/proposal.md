# Fix AMCP string escaping for special characters (B-041)

## Why

B-041 (hardware-observed on real CasparCG 2.3.2): a field value containing a
double-quote (`"`), a backslash (`\`), or a newline silently fails to apply on air
(CasparCG returns `202 CG OK`, payload mangled). The payload is escaped **twice** —
`JSON.stringify` in the browser (already turns `"`→`\"`, `\`→`\\`, newline→`\n`),
then the bridge's AMCP `escape()` escapes `"`/`\` AGAIN. CasparCG then un-quotes that
to a corrupted backslash sequence, so the template's `JSON.parse` fails and the
update is dropped.

The captured hardware wire evidence (`tools/caspar-amcp-probe/evidence/…`) proves two
things: (1) `\"`→`"` works (quote-free Persian payloads matched on air with exactly
that escaping), and (2) the bug only appears once a value contains `"`/`\`/newline —
which the ADR-0006 harness never tested. Critically, the failure **rules out** the
standard tokenizer: if CasparCG un-escaped `\\`→`\`, the current double-escape would
round-trip backslashes correctly — but it doesn't. The consistent explanation is that
CasparCG 2.3.x's quoted-string parser un-escapes **only `\"`→`"`**; every other
character (including `\`) is literal.

`amcp-mock` hid the bug because its tokenizer (`readQuoted`) is the exact inverse of
our own `escape()` (it also does `\\`→`\`), so anything we emit round-trips cleanly —
it can never reveal a divergence from real CasparCG.

B-041 stays `[~]` until the fix is **hardware-validated** on CasparCG 2.3.2 (type
`"`, `\`, and a newline in a field, Update, confirm it applies). The CasparCG
un-quote rule is the empirical unknown; this is the principled single-escape fix —
if hardware shows it is still off, we pivot to an escape-matrix harness.

## What Changes

- **One canonical AMCP quoter, applied once — no double-escaping.** The payload is
  already a JSON string (`JSON.stringify` did the JSON-level escaping). The AMCP
  layer must only make that JSON string survive CasparCG's quoted-string parsing,
  escaping **exactly** what AMCP requires and nothing `JSON.stringify` already
  handled. Per the CasparCG 2.3.x rule (only `\"` is un-escaped), the canonical
  `escape()` now escapes **`"` → `\"` only** and leaves backslashes literal (raw
  CR/LF → space, defensively — they cannot ride a single AMCP line and never occur in
  a JSON payload, whose newlines arrive as the two-char `\n`). This eliminates the
  redundant second backslash-doubling pass that was the bug. Both `CG ADD` and
  `CG UPDATE` data args already route through this single quoter exactly once.
- **`amcp-mock` decodes per REAL CasparCG rules, independently.** `readQuoted` is
  re-implemented to match CasparCG 2.3.x (un-escape only `\"`→`"`; every other char,
  including `\`, literal) — NOT as the inverse of our `escape()`. The mock now
  **fails** the old double-escaped output and **passes** only correct single-escaped
  output, and the integration test `JSON.parse`s the decoded data arg and asserts it
  equals the original object — so the regression is genuinely caught.

## Capabilities

- `runtime-caspar-bridge` (MODIFIED — the AMCP seam): AMCP string arguments are
  quoted by a single canonical quoter that escapes only what CasparCG 2.3.x requires
  (`"`→`\"`), so a JSON payload containing `"`, `\`, or a newline survives `CG ADD`
  and `CG UPDATE` byte-exact to the template's `JSON.parse`; the mock decodes per real
  CasparCG rules so this is regression-tested, not blind-passed.

## Impact

- `@cg/caspar-client` — `amcp/escape.ts` (canonical quoter: quotes-only) + its test.
- `tools/caspar-bridge` — `command-builder` doc (routing unchanged; one quoter, once).
- `tools/amcp-mock` — `amcp-parser.ts` `readQuoted` rewritten to real CasparCG rules;
  the data payload is `JSON.parse`-asserted in tests.
- Tests: canonical-quoter unit (full char matrix), mock un-quote (catches the old
  double-escape), and a bridge→mock end-to-end round-trip (`"`, `\` odd+even,
  newline, Persian — byte-exact through `CG ADD` + `CG UPDATE`).
- B-041 stays `[~]` (flips to `[x]` only after on-hardware validation).
