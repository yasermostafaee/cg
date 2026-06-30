/**
 * AMCP escape + quote — the ONE canonical quoter (Phase 5 §3.2; corrected for
 * B-041).
 *
 * The transport never sees an unquoted user value: an unescaped `"` inside a token
 * would close the AMCP quoted-string and desync the wire. There is exactly one
 * quote function in this package; every command builder MUST route through it,
 * exactly once.
 *
 * ## CasparCG 2.3.x quoted-string rule (the un-escape this MUST invert)
 *
 * Inside `"…"`, CasparCG 2.3.x un-escapes **only** `\"` → `"`. Every other
 * character — **including `\`** — is taken literally; an unescaped `"` ends the
 * token. (B-041: the captured hardware wire evidence shows `\"`-per-quote payloads
 * render correctly, and `"`/`\`/newline values fail under the old double-escaping —
 * which rules out a `\\`→`\` rule. Pending on-hardware re-confirmation of the
 * special-character payload.)
 *
 * So the ONLY thing the AMCP layer must do is escape `"` → `\"`. It MUST NOT escape
 * `\` — backslashes are literal to CasparCG, and the data argument is already a
 * `JSON.stringify` string (the JSON layer escaped `"`, `\`, and newline). Escaping
 * `\` again (the old behavior) doubled backslashes and corrupted the payload, so the
 * template's `JSON.parse` failed and the update was silently dropped.
 *
 * ## Inputs + invariant
 *
 * Callers pass either a `JSON.stringify` payload or a simple token (e.g. a URL).
 * Neither ends in a lone backslash, so the "a trailing `\` would escape the wrapping
 * quote" edge cannot arise (there is no `\\`→`\` collapse to protect it with under
 * this rule). Raw `\r`/`\n` cannot ride a single AMCP line, so they are mapped to a
 * space defensively; a field-value newline never reaches here as a raw newline — JSON
 * already emitted it as the two characters `\` + `n`, which pass through literally and
 * CasparCG hands back to the template's `JSON.parse`.
 */
export function escape(s: string): string {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '"':
        // The one escape CasparCG 2.3.x un-escapes (`\"` → `"`).
        out += '\\"';
        break;
      case '\r':
      case '\n':
        // Raw CR/LF would terminate the AMCP line; neutralize. (Field-value newlines
        // arrive pre-escaped from JSON as the two chars `\` + `n`, handled below.)
        out += ' ';
        break;
      default:
        // Everything else — including a literal backslash — is passed through; the
        // JSON layer already did all JSON-level escaping and CasparCG keeps `\`
        // literal.
        out += ch;
    }
  }
  return out;
}

/** Wrap a raw string in `"…"` with the canonical AMCP escape applied. */
export function quote(s: string): string {
  return `"${escape(s)}"`;
}
