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
raw newline AFTER tokenizing the line, inside the token value — the failure is
downstream of framing. **Correction (2026-07-07, operator-approved):** the DP2
newline failure happens in **V8's parse of the injected `update("…")` script** —
`html_cg_proxy::update()` re-escapes quotes only and embeds the tokenizer-decoded
data in a JS string literal, and a raw LF inside that literal is a script
`SyntaxError`, so **`window.update` is never invoked** — NOT in the template's
`JSON.parse` as this section originally said. (A raw newline must still never be
emitted by the AMCP layer — that WOULD break framing — which the mock must now
enforce.)

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

## Hardware sweep results (recorded 2026-07-07)

### Pass 1 — local CasparCG `2.5.0 69e8ad5 Stable` (PROVISIONAL — the canonical rule requires a 2.3.x pass)

Sweep run: `--sweep --caspar-host 127.0.0.1 --serve-host 127.0.0.1`, channel 1 /
layer 10 / flash-layer 0. Full per-candidate matrix recorded in
`tools/caspar-amcp-probe/README.md` → "Recording the result" (pass 1). Evidence
committed per the repo's existing precedent
(`tools/caspar-amcp-probe/evidence/casparcg-2.3.2-4de6d18f/`):
`tools/caspar-amcp-probe/evidence/casparcg-2.5.0-69e8ad5/escape-sweep.results.json`
and `…/escape-sweep.wire.ndjson`.

- All 7 pre-existing candidates FAILED, including the three controls — the DP1/DP2
  signatures reproduce on this build (`quotes-only` and `backslash-quote` never fire
  `window.update`: a V8 script `SyntaxError` kills the injected `update("…")` call).
- Both two-layer-model candidates (added pre-pass with operator approval) PASSED
  every character class; `js-escape+amcp-escape` is additionally byte-exact
  (`bytes=YES`) → **provisional winner: `js-escape+amcp-escape`** (the simpler, per
  the README tie-break).
- Direct tokenizer evidence: `structural-quotes+uXXXX-controls` was received as
  `…New text000asecond text…` — the unknown backslash-escape pair was DROPPED by
  the tokenizer, exactly as the upstream `v2.3.x-lts`/`master` source predicts.

The provisional rule, stated in both directions (wording locks in as CANONICAL only
after the 2.3.x pass agrees):

- **The un-escape CasparCG applies (two layers):** (1) the AMCP tokenizer maps
  backslash-backslash → one backslash, backslash-quote → a literal quote,
  backslash-n → a RAW newline (`0x0A`), and silently DROPS any other backslash-X
  pair; then (2) `html_cg_proxy::update()` re-escapes quotes only and embeds the
  result in an `update("…")` JS string literal, so V8 applies a second full
  string-literal un-escape before the template's `window.update` sees the value.
- **The escape the bridge must emit (the exact inverse):** starting from the
  `JSON.stringify` payload, first double every backslash (pre-compensating the V8
  layer), then apply the AMCP escape — double every backslash again and escape
  every quote. Net wire effect: each JSON backslash → FOUR wire backslashes; each
  quote → backslash-quote; no raw control byte is ever emitted.

### Behavioral evidence on 2.5.0 for the CURRENT #245 quotes-only rule (operator repro, 2026-07-07)

`CG ADD` / `CG UPDATE` whose seq items contain the JSON two-char newline, sent under
the current quotes-only rule, returned `202 CG OK` with
`html[...] Log: Uncaught SyntaxError: Invalid or unexpected token`; `window.update`
never ran and the output kept showing the template's baked-in default values. A
later UPDATE with the newline removed from item 1 only STILL failed (items 2–3
still contained newlines) — exactly the tokenizer(backslash-n → raw LF) →
`update("…")` embed → V8 signature the two-layer model predicts. (Raw log lines to
be pasted by the operator.)

### Status (2026-07-07) — winner: `js-escape+amcp-escape`

Empirically confirmed on 2.5.0 (`69e8ad5`); **provisional for 2.3.2**, supported by
the source-level finding that `v2.3.x-lts` and `master` share byte-identical escape
semantics in both layers (AMCP tokenizer + `html_cg_proxy` `update("…")` embed); a
2.3.x hardware pass (sweep, or live special-char validation) remains the gate
before B-041 closes. Pass 2 is DEFERRED — no 2.3.2 build was available this
session; the harness is ready to re-run.
