# Design — AMCP escaping, take 2: evidence-grounded (B-041)

> **Investigation + design only this change — no code.** The corrected escaping is
> determined empirically (escape-matrix harness on real hardware) and implemented in
> a follow-up, because the two hardware data points are inconsistent under every
> simple un-escape model derivable on paper.

## Byte-level trace (from the CURRENT code on `main`, post-#245 quotes-only)

Field value the operator typed in the multiline field `ttt`:
`New text␊second text` (a RAW newline byte `0x0A` between the words).

| Layer                | File                                                                                | Transformation                                                                                                     | Result (value region)                                                    |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1. Inspector commit  | `apps/runtime/.../inspector/Inspector.tsx` (multiline `<textarea>` `onBlur`)        | sends the raw textarea value via `stack.update`                                                                    | `New text␊second text` (raw `0x0A`)                                      |
| 2. browser→bridge WS | `WebSocketRuntime` → `serializeWsFrame` (JSON) → bridge `parseWsFrame` (JSON.parse) | round-trips the string; raw `0x0A` preserved in `fields.ttt`                                                       | `New text␊second text`                                                   |
| 3. serialize         | `command-builder.ts:serialize` = `JSON.stringify`                                   | `0x0A` → the **two chars** `\` `n`                                                                                 | `…"ttt":"New text\nsecond text"…` (backslash-n)                          |
| 4. AMCP escape       | `@cg/caspar-client escape()` (`escape.ts`, quotes-only)                             | `"`→`\"`; **`\` and `n` pass through literally**; raw `\r`/`\n`→space (never fires — there is no raw newline left) | `…\"ttt\":\"New text\nsecond text\"…` (still backslash-n)                |
| 5. quote + send      | `quote()` wraps; `command-queue`→`transport.send` writes `line + \r\n` **verbatim** | no transform of the line content                                                                                   | wire token carries **backslash-n** (`\` `n`, 2 chars) — NOT a raw `0x0A` |

**So the bridge sends `\n` as backslash-n (2 chars).** It does NOT put a raw newline
on the wire. (`escape()` maps raw CR/LF→space, and `JSON.stringify` already turned
the newline into the two-char `\n` before `escape()` ran.)

## The concrete diagnosis

Hardware (CasparCG 2.3.2, with #245 live):

```
Received: CG 1-60 UPDATE 0 "{\"ttt\":\"New text␊second text\"}"   → 202 CG OK
html[...] Uncaught SyntaxError: Invalid or unexpected token
```

The bridge emitted backslash-n (trace above), yet the template's `JSON.parse` saw a
**raw newline inside the string literal** (→ SyntaxError; a JSON string literal may
not contain a literal `0x0A`). The only layer between the wire and the template is
CasparCG. Therefore:

> **CasparCG 2.3.x un-escapes `\n` (backslash-n) → a RAW newline (`0x0A`) inside the
> quoted token.** It actively processes backslash escapes.

This **disproves the core assumption of #245** ("inside `"…"`, CasparCG treats `\`
literally; only `\"` is an escape"). It is false: CasparCG un-escapes `\n`, so the
"quotes-only, leave backslashes literal" rule is wrong, and a JSON `\n` must NOT be
sent as a bare backslash-n.

Whether the raw `0x0A` also breaks AMCP **framing**: the bridge does not emit a raw
newline (trace step 5), so framing is intact up to CasparCG; CasparCG produces the
raw newline AFTER tokenizing the line, inside the token value — so the failure is the
template's `JSON.parse`, not line framing. (A raw newline must still never be emitted
by the AMCP layer — that WOULD break framing — which the mock must now enforce.)

## Why the exact rule can't be settled on paper (two conflicting data points)

- **DP2 (this change, quotes-only):** newline → CasparCG yields a raw `0x0A`
  (definitive: `\n`→newline). `"` and `\` (odd) also still fail.
- **DP1 (original B-041, the double-escape `\`→`\\`, `"`→`\"`):** `"`, `\` (odd), and
  newline ALSO failed.

Under a **standard escape state machine** (`\\`→`\`, `\"`→`"`, `\n`→newline), the
**original double-escape round-trips all three correctly** (e.g. newline: JSON `\n` →
escape `\\n` → CasparCG `\\`→`\`, `n` literal → `\n` → `JSON.parse` → newline). That
contradicts DP1. Under a **naive sequential `\X`-substitution** model, some cases flip
the other way and contradict DP2. No single hand-derived model satisfies BOTH data
points — so the precise inverse of CasparCG 2.3.x's un-escape (especially the
backslash-run / `\n` interaction) is **not derivable abstractly**. (This is exactly
the "pivot to an escape-matrix harness" path pre-agreed when the analytical fix was
attempted.)

## Designed approach (implemented in the follow-up, then hardware-validated)

1. **Escape-matrix hardware harness.** Extend `tools/caspar-amcp-probe` to drive real
   CasparCG 2.3.2 with a fixed payload exercising the full matrix — `"`, `\` ×1–4,
   newline, tab, and combinations (Persian alongside) — under **several candidate
   AMCP escapings**, and record, per candidate, whether the served template's
   `window.update` receives a value whose `JSON.parse` equals the original
   (byte-exact). The winning candidate IS the rule. This removes the guesswork the
   user called out.
2. **One canonical quoter = the empirical inverse.** Implement the winning escaping as
   the single `@cg/caspar-client` quoter (the corrected `escape()`), applied once over
   the JSON payload by `command-builder` (both `CG ADD` + `CG UPDATE`). The
   constraints the rule MUST satisfy (from the evidence): the JSON's `\n` must survive
   CasparCG's `\n`→newline un-escape as a two-char `\n` to the template (so backslash
   escaping is required — the opposite of #245); and no raw control char may reach the
   wire (framing).
3. **amcp-mock decodes by the REAL rule AND rejects framing/JSON-breakers.** Re-point
   `amcp-parser.ts readQuoted` to the empirically-confirmed CasparCG un-escape
   (NOT the inverse of our own `escape()`), AND make the mock **reject / flag a raw
   control character (`0x0A`/`0x0D`) in a decoded data argument** and surface a
   decoded payload that fails `JSON.parse` — so the mock catches THIS class (a raw
   newline reaching the template) which it currently does not.
4. **Full char + control-char matrix tests:** canonical-quoter unit (exact bytes +
   round-trip under the confirmed rule), mock-decode (catches a raw-newline / mangled
   payload), and bridge→mock end-to-end for the whole matrix.

## Scope / status

- B-041 stays `[~]`. #245 (quotes-only) is confirmed wrong and will be superseded by
  the empirically-derived escaping.
- This change is the diagnosis + plan; the harness + fix + mock changes land in the
  follow-up and close only after on-hardware matrix validation.
