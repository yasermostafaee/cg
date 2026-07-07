import type { AmcpRequest } from './types.js';

/**
 * AMCP command tokenizer.
 *
 * Wire form is whitespace-separated; tokens containing spaces are wrapped in
 * `"..."`. Quoted-string un-escaping models **real CasparCG's tokenizer** — the
 * FIRST of the two un-escape layers a CG data argument passes through (B-041;
 * hardware-confirmed on 2.5.0 `69e8ad5`, provisional for 2.3.2 — see
 * `openspec/changes/fix-amcp-escaping-v2/design.md` → "Hardware sweep results"):
 *
 * - `\\` → `\`, `\"` → `"`, `\n` → a RAW newline (`0x0A`)
 * - any OTHER `\X` pair is silently DROPPED (both characters; the sweep observed
 *   a wire backslash-u-000a arriving as `000a`)
 * - an unescaped `"` closes the token
 *
 * The SECOND layer (html_cg_proxy embedding the decoded arg in an `update("…")`
 * V8 string literal) is emulated per CG data argument in `cg-data.ts`, not here.
 * The mock models CasparCG from the hardware evidence, independently of
 * `@cg/caspar-client`'s `escape()` (the two agree only because both implement
 * the confirmed rule) — decoding by the REAL rule is what lets the mock CATCH a
 * wrongly-escaped emission (e.g. the failed #245 quotes-only rule, whose bare
 * backslash-n decodes to a raw newline here) instead of mirroring the bug.
 * Empty input → null.
 */
export function parseAmcpLine(line: string): AmcpRequest | null {
  const raw = line.trimEnd();
  const tokens = tokenize(raw);
  const first = tokens[0];
  if (first === undefined) return null;
  return {
    verb: first.toUpperCase(),
    args: tokens.slice(1),
    raw,
  };
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    while (i < len && isSpace(input.charCodeAt(i))) i++;
    if (i >= len) break;

    const ch = input.charCodeAt(i);
    if (ch === 0x22 /* " */) {
      const { value, next } = readQuoted(input, i);
      out.push(value);
      i = next;
    } else {
      const { value, next } = readBare(input, i);
      out.push(value);
      i = next;
    }
  }
  return out;
}

function readBare(s: string, start: number): { value: string; next: number } {
  let i = start;
  while (i < s.length && !isSpace(s.charCodeAt(i))) i++;
  return { value: s.slice(start, i), next: i };
}

function readQuoted(s: string, start: number): { value: string; next: number } {
  let i = start + 1;
  let out = '';
  while (i < s.length) {
    const c = s.charCodeAt(i);
    // The real tokenizer's escapes: `\\` → `\`, `\"` → `"`, `\n` → a raw LF;
    // any other `\X` pair — including a dangling trailing `\` — is silently
    // dropped (both characters).
    if (c === 0x5c /* \ */) {
      const next = i + 1 < s.length ? s[i + 1] : undefined;
      if (next === '\\') out += '\\';
      else if (next === '"') out += '"';
      else if (next === 'n') out += '\n';
      i += 2;
      continue;
    }
    // An unescaped `"` closes the token.
    if (c === 0x22) {
      return { value: out, next: i + 1 };
    }
    out += s[i];
    i++;
  }
  // Unterminated quote — return what we have. The handler can reject.
  return { value: out, next: i };
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09;
}
