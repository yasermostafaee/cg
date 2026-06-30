import type { AmcpRequest } from './types.js';

/**
 * AMCP command tokenizer.
 *
 * Wire form is whitespace-separated; tokens containing spaces are wrapped in
 * `"..."`. Quoted-string un-escaping models **real CasparCG 2.3.x** (B-041):
 * inside `"..."`, ONLY `\"` → `"` is an escape; every other character — including a
 * backslash — is LITERAL, and an unescaped `"` closes the token. This is deliberately
 * NOT the inverse of `@cg/caspar-client`'s `escape()` — modelling CasparCG
 * independently is what lets the mock CATCH a double-escaped (backslash-doubled)
 * payload instead of mirroring it. Empty input → null.
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
    // CasparCG 2.3.x: `\"` is the ONLY in-quote escape → a literal `"`.
    if (c === 0x5c /* \ */ && i + 1 < s.length && s.charCodeAt(i + 1) === 0x22 /* " */) {
      out += '"';
      i += 2;
      continue;
    }
    // An unescaped `"` closes the token.
    if (c === 0x22) {
      return { value: out, next: i + 1 };
    }
    // Everything else — including a lone backslash — is literal.
    out += s[i];
    i++;
  }
  // Unterminated quote — return what we have. The handler can reject.
  return { value: out, next: i };
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09;
}
