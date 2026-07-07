/**
 * AMCP escape + quote — the ONE canonical quoter (Phase 5 §3.2; corrected for
 * B-041 take 2 — the escaping is empirically derived on hardware).
 *
 * The transport never sees an unquoted user value: an unescaped `"` inside a token
 * would close the AMCP quoted-string and desync the wire. There is exactly one
 * quote function in this package; every command builder MUST route through it,
 * exactly once.
 *
 * ## The TWO-layer un-escape this inverts (hardware-confirmed)
 *
 * CasparCG applies two un-escapes between the wire and an HTML template's
 * `window.update` (escape-matrix sweep, winner `js-escape+amcp-escape`;
 * see `openspec/changes/fix-amcp-escaping-v2/design.md` → "Hardware sweep
 * results" — confirmed on 2.5.0 `69e8ad5`, provisional for 2.3.2 pending a 2.3.x
 * pass; upstream `v2.3.x-lts` and `master` share identical escape semantics):
 *
 * 1. **The AMCP tokenizer** (quoted-string): `\\` → `\`, `\"` → `"`, `\n` → a
 *    RAW newline (`0x0A`), and any OTHER `\X` pair is silently dropped (both
 *    characters). Backslashes are NOT literal — the #245 "quotes-only"
 *    assumption is disproven by hardware.
 * 2. **html_cg_proxy → V8**: `update()` re-escapes QUOTES ONLY and embeds the
 *    tokenizer-decoded data in an `update("…")` JS string literal, so V8 applies
 *    a second, full string-literal un-escape (`\\` → `\`, `\n` → newline, …). A
 *    raw LF/CR inside that literal is a script `SyntaxError` — `window.update`
 *    never fires (the exact on-air symptom of B-041).
 *
 * `escape()` is the exact inverse, applied ONCE here: first the JS-literal layer
 * (double every backslash; carry a raw LF/CR as `\n`/`\r`), then the AMCP layer
 * (double every backslash again; escape every quote). Net effect per input char:
 *
 * - `\`        → FOUR wire backslashes
 * - `"`        → `\"` (the proxy's own quote re-escape covers the second layer)
 * - raw LF/CR  → `\\n` / `\\r` (two backslashes + letter — see below)
 * - everything else literal (incl. tab: legal in both layers, survives as-is)
 *
 * The executable spec of this rule is the winning candidate in
 * `tools/caspar-amcp-probe/src/escape-candidates.ts`; a parity test there pins
 * this function to it byte-for-byte.
 *
 * ## Raw CR/LF inputs (framing safety)
 *
 * The quoter NEVER emits a raw `0x0A`/`0x0D` — either would terminate the AMCP
 * line mid-command and desync the wire. A `JSON.stringify` payload never contains
 * them (JSON escapes all controls), but the quoter must stay framing-safe for ANY
 * caller, so a raw LF/CR input is carried as its JS-layer escape (`\n`/`\r`,
 * backslash-doubled for the AMCP layer → `\\n`/`\\r` on the wire) and is restored
 * byte-exact by CasparCG's two un-escape layers on the CG data path.
 *
 * ## Non-data arguments
 *
 * Simple tokens (e.g. the served template URL) pass only layer 1. They contain no
 * `\`, `"`, or control characters, so the two-layer escape is the identity for
 * them and one quoter safely serves both kinds of argument.
 */
export function escape(s: string): string {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '\\':
        // JS layer doubles it, AMCP layer doubles each again → four on the wire.
        out += '\\\\\\\\';
        break;
      case '"':
        // AMCP layer only — between the layers, html_cg_proxy re-escapes quotes
        // itself, so V8 always sees `\"` without our help.
        out += '\\"';
        break;
      case '\n':
        // JS-layer `\n` (V8 restores the newline), backslash-doubled for AMCP.
        out += '\\\\n';
        break;
      case '\r':
        out += '\\\\r';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** Wrap a raw string in `"…"` with the canonical AMCP escape applied. */
export function quote(s: string): string {
  return `"${escape(s)}"`;
}
