# Design — Correct AMCP string escaping (B-041)

## Root cause + the CasparCG rule (hypothesis, hardware-arbitrated)

The data argument is escaped twice:

1. **JSON layer** (browser): `JSON.stringify(fields)` → a JSON string where `"`→`\"`,
   `\`→`\\`, and a real newline → the two characters `\` + `n`.
2. **AMCP layer** (bridge): `escape()` escapes `"`→`\"` AND `\`→`\\` **again**.

Whether the double-escape round-trips depends entirely on how CasparCG 2.3.x
un-escapes a quoted string. The evidence:

- **Quote-free Persian payloads work on hardware** with exactly `\"`-for-each-quote
  escaping (`tools/caspar-amcp-probe/evidence/casparcg-2.3.2-4de6d18f/`). So CasparCG
  un-escapes `\"`→`"`.
- **`"`, `\`, and newline fail** once they appear in a value. If CasparCG un-escaped
  `\\`→`\` (the "standard" tokenizer), the current double-escape would round-trip
  backslashes correctly — so the failure **rules out** the standard rule.

The simplest rule consistent with both facts: **inside `"…"`, CasparCG 2.3.x
un-escapes ONLY `\"`→`"`; every other character (including `\`) is literal.** Under
this rule:

- The current double-escape corrupts: a value backslash becomes 4 wire backslashes
  (JSON ×2, `escape()` ×2); CasparCG (backslash literal) leaves them, so `JSON.parse`
  sees doubled backslashes / broken escapes → update dropped (the odd/even signature).
- The **fix** — escape **`"`→`\"` only**, leave backslashes literal — round-trips
  byte-exact. Worked example, value `a"b\c` + newline:
  - `JSON.stringify` → `{"h":"a\"b\\c\n"}`
  - quotes-only `escape()` → `{\"h\":\"a\\"b\\c\n\"}` (only the `"` became `\"`; the
    `\\`, the value-`\"`, and the `\n` text are untouched)
  - CasparCG (only `\"`→`"`) → `{"h":"a\"b\\c\n"}` (the exact JSON string)
  - `JSON.parse` → `a"b` + `\` + `c` + newline ✓
  - Odd AND even backslash counts both round-trip (verified for 1–4).

JSON.stringify never emits a string ending in a lone backslash, so the
"trailing-`\` would escape the wrapper quote" edge never arises for the data payload
(or for URLs); documented as the quoter's input invariant.

## The fix (single source of truth, applied once)

- `packages/caspar-client/src/amcp/escape.ts` — the **one** canonical quoter:
  - `escape(s)`: `"` → `\"`; raw `\r`/`\n` → space (defensive — can't ride a single
    AMCP line; field-value newlines arrive as the two-char `\n` from JSON and pass
    through literally); **every other char, including `\`, literal**.
  - `quote(s)` = `"${escape(s)}"` (unchanged wrapper).
- `tools/caspar-bridge/src/command-builder.ts` — unchanged routing: both `CG ADD` and
  `CG UPDATE` build the data arg as `quote(JSON.stringify(fields))` — one quoter, one
  pass. Only the doc comment changes (no more backslash doubling).

## amcp-mock decodes per REAL CasparCG (independently)

`tools/amcp-mock/src/amcp-parser.ts` `readQuoted` is rewritten to the CasparCG 2.3.x
rule — un-escape **only** `\"`→`"`; every other char (incl. `\`) literal; an
unescaped `"` closes the token — **not** the inverse of our `escape()`. Consequences:

- The OLD double-escaped output decodes WRONG (doubled backslashes) → a test that
  `JSON.parse`s the decoded data and compares to the original FAILS on it → the
  regression is genuinely caught.
- The NEW quotes-only output decodes to the exact JSON string → `JSON.parse` → the
  original object.

The handlers already record the decoded `CG ADD` / `CG UPDATE` data string
(`recordCgAdd` / `recordCgUpdate`); the integration test `JSON.parse`s it and asserts
object equality.

## Tests (full character coverage)

- **Canonical quoter unit** (`escape.test.ts`): exact wire bytes for `"`, `\` (1, 2,
  3, 4 backslashes), newline, tab, and combinations — asserting backslashes are NOT
  doubled and `"`→`\"`.
- **Mock un-quote** (`amcp-parser` test): decoding the canonical output yields the
  original JSON; decoding the OLD double-escaped output is observably different
  (wrong) — so the mock catches the regression rather than mirroring our escaper.
- **End-to-end** (bridge → amcp-mock): a field value with `"`, `\` (odd AND even
  counts), and a newline survives `CG ADD` and `CG UPDATE`; the mock decodes +
  `JSON.parse`s the data arg to a byte-exact match of the original (Persian intact).

## Hardware validation (mandatory, before close)

After review/merge, validate on real CasparCG 2.3.2: type `"`, `\`, and a newline in
a field, Update, confirm it applies on air. The CasparCG un-quote rule is the
empirical unknown; this is the principled single-escape attempt. If hardware shows it
is still off, pivot to an escape-matrix harness (sweep candidate escapings on real
hardware) — the tests here are structured as a matrix to make that pivot cheap.

## Out of scope

- Changing the JSON payload contract / `window.update` semantics.
- Base64 / alternate encodings (a fallback only if the principled escape fails on
  hardware).
