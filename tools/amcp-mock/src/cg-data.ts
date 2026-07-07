import type { CgDataResult } from './types.js';

/**
 * B-041 — emulation of the SECOND un-escape layer a `CG ADD` / `CG UPDATE` data
 * argument passes through in real CasparCG's HTML producer path, used as
 * VALIDATION (rule provenance: `openspec/changes/fix-amcp-escaping-v2/design.md`
 * → "Hardware sweep results"; confirmed on 2.5.0 `69e8ad5`, provisional 2.3.2).
 *
 * After the AMCP tokenizer (layer 1, `amcp-parser.ts`) decodes the quoted wire
 * argument, `html_cg_proxy::update()` re-escapes QUOTES ONLY and embeds the
 * result in an `update("…")` script, which V8 parses as a JS string literal — a
 * second, full un-escape. On real hardware a payload that breaks this layer
 * still gets `202 CG OK`: the V8 `SyntaxError` happens asynchronously and
 * `window.update` simply never fires (the exact on-air symptom of B-041). The
 * mock mirrors that — it still acks — but records the rejection instead of a
 * delivered payload, so a test asserting on the payload catches the class
 * instead of mirroring the bug.
 */
export function decodeCgData(decodedArg: string): CgDataResult {
  // html_cg_proxy re-escapes quotes only, then V8 un-escapes the whole literal.
  // A BARE raw LF/CR in the decoded argument survives the quotes-only re-escape
  // and is a V8 SyntaxError inside the literal (classified `raw-control-char` —
  // exactly what the failed #245 quotes-only escaping produces, its backslash-n
  // having become a raw newline in layer 1); a backslash IMMEDIATELY before the
  // raw LF/CR is instead a legal V8 LineContinuation — the pair is silently
  // swallowed and update() fires with the corrupted payload, as on hardware.
  let delivered: string;
  try {
    delivered = v8StringLiteral(decodedArg.replace(/"/g, '\\"'));
  } catch (err) {
    return {
      data: null,
      rejected: {
        reason: err instanceof RawControlCharError ? 'raw-control-char' : 'js-syntax-error',
        decodedArg,
        detail: `injected update("…") script does not parse: ${String(err instanceof Error ? err.message : err)}`,
      },
    };
  }

  // The HTML template does `JSON.parse(delivered)` — surface a payload its
  // parse would reject (this includes an empty data argument) instead of
  // silently recording garbage.
  try {
    JSON.parse(delivered);
  } catch (err) {
    return {
      data: null,
      rejected: {
        reason: 'invalid-json',
        decodedArg,
        detail: `delivered value fails the template's JSON.parse: ${String(err instanceof Error ? err.message : err)}`,
      },
    };
  }

  return { data: delivered };
}

/** Tags the raw-LF/CR failure mode so `decodeCgData` can classify it. */
class RawControlCharError extends SyntaxError {}

/**
 * V8's parse of the CONTENTS of a double-quoted string literal. Throws a
 * `SyntaxError` exactly where the injected `update("…")` script would fail:
 * a bare raw LF/CR (unescaped LineTerminator — tagged `RawControlCharError`),
 * an unescaped `"` (closes the literal early — the leftover characters make the
 * script unparseable), a dangling trailing `\` (escapes the closing quote), or
 * a malformed `\x`/`\u` escape. A backslash followed by a raw LF/CR (or CRLF)
 * is a LineContinuation: legal, contributes nothing. Simplifications: legacy
 * octal escapes (sloppy-mode `\1`…`\7`) decode via the identity branch, and
 * U+2028/U+2029 are treated as plain characters (legal raw since ES2019) — no
 * emission under any swept escaping produces either.
 */
function v8StringLiteral(script: string): string {
  let out = '';
  let i = 0;
  while (i < script.length) {
    const c = script[i] as string;
    if (c === '"') {
      throw new SyntaxError('unescaped " closes the literal early');
    }
    if (c === '\n' || c === '\r') {
      throw new RawControlCharError(
        'raw line terminator inside the literal — window.update never fires',
      );
    }
    if (c !== '\\') {
      out += c;
      i++;
      continue;
    }
    const n = script[i + 1];
    if (n === undefined) {
      throw new SyntaxError('dangling \\ escapes the closing quote');
    }
    // LineContinuation: backslash + LF, or backslash + CR (+ optional LF).
    if (n === '\n' || n === '\r') {
      i += n === '\r' && script[i + 2] === '\n' ? 3 : 2;
      continue;
    }
    i += 2;
    switch (n) {
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'b':
        out += '\b';
        break;
      case 'f':
        out += '\f';
        break;
      case 'v':
        out += '\v';
        break;
      case '0':
        out += '\0';
        break;
      case 'x': {
        out += String.fromCharCode(readHex(script, i, 2));
        i += 2;
        break;
      }
      case 'u': {
        if (script[i] === '{') {
          const close = script.indexOf('}', i + 1);
          if (close === -1) throw new SyntaxError('unterminated \\u{…} escape');
          out += String.fromCodePoint(readHex(script, i + 1, close - (i + 1)));
          i = close + 1;
        } else {
          out += String.fromCharCode(readHex(script, i, 4));
          i += 4;
        }
        break;
      }
      default:
        // Identity escape — covers `\\` → `\`, `\"` → `"`, and V8's "unknown
        // escape yields the character itself" rule.
        out += n;
    }
  }
  return out;
}

/** Read exactly `len` hex digits at `at`; throw the V8-shaped SyntaxError otherwise. */
function readHex(script: string, at: number, len: number): number {
  const chunk = script.slice(at, at + len);
  if (len < 1 || chunk.length !== len || !/^[0-9a-fA-F]+$/.test(chunk)) {
    throw new SyntaxError('invalid hexadecimal escape sequence');
  }
  return parseInt(chunk, 16);
}
