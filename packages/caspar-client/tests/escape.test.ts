import { describe, expect, it } from 'vitest';
import { escape, quote } from '../src/amcp/escape.js';

/**
 * B-041 (take 2) — the canonical AMCP quoter inverts CasparCG's TWO-layer
 * un-escape (hardware-confirmed sweep winner `js-escape+amcp-escape`; see
 * `openspec/changes/fix-amcp-escaping-v2/design.md` → "Hardware sweep results"):
 *
 *   layer 1 — AMCP tokenizer: `\\`→`\`, `\"`→`"`, `\n`→raw LF, other `\X` pairs
 *             silently dropped; an unescaped `"` closes the token.
 *   layer 2 — html_cg_proxy re-escapes QUOTES ONLY and embeds the decoded data
 *             in an `update("…")` script → V8 applies a full JS string-literal
 *             un-escape; a raw LF/CR inside the literal is a SyntaxError.
 *
 * `tokenizerDecode` + `proxyV8Decode` below model the two layers independently
 * of the quoter, so the round-trip assertions prove `escape()` against the real
 * rule — never against itself. (Byte-for-byte parity with the sweep's winning
 * candidate encoder is pinned in `tools/caspar-amcp-probe/tests/`.)
 */

/** Layer 1 — the real AMCP tokenizer's quoted-string un-escape. */
function tokenizerDecode(wire: string): string {
  expect(wire.startsWith('"') && wire.endsWith('"')).toBe(true);
  const body = wire.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      const n = body[i + 1];
      if (n === '\\') out += '\\';
      else if (n === '"') out += '"';
      else if (n === 'n') out += '\n';
      // any other \X pair is silently dropped (both chars)
      i++;
      continue;
    }
    // A well-formed emission never contains a mid-token unescaped quote — it
    // would close the token early and desync the wire.
    expect(c).not.toBe('"');
    out += c;
  }
  return out;
}

/** Layer 2 — html_cg_proxy quote-re-escape + V8 string-literal un-escape. */
function proxyV8Decode(tokenized: string): string {
  // A raw LF/CR inside the injected update("…") literal is a V8 SyntaxError —
  // window.update never fires. A correct emission never produces one here.
  expect(/[\n\r]/.test(tokenized)).toBe(false);
  const script = tokenized.replace(/"/g, '\\"');
  let out = '';
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    // An unescaped quote would close the literal early → SyntaxError.
    expect(c).not.toBe('"');
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = script[i + 1];
    // A dangling backslash would escape the closing quote → SyntaxError.
    expect(n).toBeDefined();
    i++;
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    // identity escape — covers `\\`→`\`, `\"`→`"`, and V8's unknown-escape rule
    else out += n as string;
  }
  return out;
}

/** What the template's `window.update` receives for a value quoted by `quote()`. */
function throughCaspar(s: string): string {
  return proxyV8Decode(tokenizerDecode(quote(s)));
}

// Mirrors the probe's HARD_PAYLOAD (`tools/caspar-amcp-probe/src/escape-candidates.ts`)
// — one value per character class the sweep validated on hardware.
const MATRIX: Record<string, string> = {
  quote: 'aaa"bbb',
  bs1: 'a\\b',
  bs2: 'a\\\\b',
  bs3: 'a\\\\\\b',
  bs4: 'a\\\\\\\\b',
  newline: 'New text\nsecond text',
  tab: 'col1\tcol2',
  persian: 'خبر فوری ۱۴۰۳ — «به‌روزرسانی»',
  combo: 'he said "a\\b"\nخط دوم',
};

describe('escape — exact wire bytes (the two-layer rule)', () => {
  it('passes plain ASCII + Persian through unchanged', () => {
    expect(escape('hello')).toBe('hello');
    expect(escape('خبر فوری ۱۴۰۳ — «به‌روزرسانی»')).toBe('خبر فوری ۱۴۰۳ — «به‌روزرسانی»');
    expect(escape('')).toBe('');
  });

  it('escapes a double-quote as \\" (the proxy re-escapes it for the V8 layer)', () => {
    expect(escape('a"b')).toBe('a\\"b');
  });

  it('emits FOUR wire backslashes per input backslash (both layers pre-compensated)', () => {
    expect(escape('a\\b')).toBe('a\\\\\\\\b'); // 1 → 4
    expect(escape('a\\\\b')).toBe('a\\\\\\\\\\\\\\\\b'); // 2 → 8
  });

  it('a JSON payload gets the net rule: every \\ ×4, every " → \\" (nothing else)', () => {
    const json = JSON.stringify(MATRIX);
    expect(escape(json)).toBe(json.replace(/\\/g, '\\\\\\\\').replace(/"/g, '\\"'));
  });

  it('carries a raw LF/CR as its backslash-doubled JS escape — NEVER a raw byte', () => {
    // Framing choice (documented in escape.ts): a raw LF/CR input rides as the
    // JS-layer `\n`/`\r`, backslash-doubled for the AMCP layer — lossless on the
    // CG data path, and the AMCP line framing can never break.
    expect(escape('a\nb')).toBe('a\\\\nb'); // backslash, backslash, n
    expect(escape('a\rb')).toBe('a\\\\rb');
  });

  it('leaves a raw tab literal (legal in both layers)', () => {
    expect(escape('a\tb')).toBe('a\tb');
  });

  it('never emits a raw 0x0A/0x0D for ANY input (AMCP framing safety)', () => {
    const inputs = [...Object.values(MATRIX), 'raw\nLF', 'raw\rCR', '\r\n', '\n', '\r'];
    for (const s of inputs) {
      expect(/[\n\r]/.test(quote(s))).toBe(false);
    }
  });
});

describe('quote — round-trips byte-exact through the modeled two-layer un-escape', () => {
  it('wraps in quotes with the escape applied once', () => {
    expect(quote('hello')).toBe('"hello"');
    expect(quote('say "hi"')).toBe('"say \\"hi\\""');
  });

  for (const [name, value] of Object.entries(MATRIX)) {
    it(`round-trips a JSON field value containing: ${name}`, () => {
      const fields = { v: value };
      const delivered = throughCaspar(JSON.stringify(fields));
      // What window.update receives equals the original JSON string byte-exact…
      expect(delivered).toBe(JSON.stringify(fields));
      // …and the template's JSON.parse recovers the value byte-exact.
      expect((JSON.parse(delivered) as { v: string }).v).toBe(value);
    });
  }

  it('round-trips the WHOLE hard payload byte-exact (the sweep’s pass condition)', () => {
    const json = JSON.stringify(MATRIX);
    expect(throughCaspar(json)).toBe(json);
    expect(JSON.parse(throughCaspar(json))).toEqual(MATRIX);
  });

  it('round-trips a raw LF/CR input lossless on the CG data path', () => {
    expect(throughCaspar('line1\nline2')).toBe('line1\nline2');
    expect(throughCaspar('a\rb')).toBe('a\rb');
  });

  it('list fields (arrays of items) survive as structured JSON', () => {
    const fields = {
      items: [
        { id: 'i1', text: 'خبر اول\nخط دوم' },
        { id: 'i2', text: 'a "quoted" \\ item' },
      ],
    };
    const delivered = throughCaspar(JSON.stringify(fields));
    expect(JSON.parse(delivered)).toEqual(fields);
    expect(Array.isArray((JSON.parse(delivered) as typeof fields).items)).toBe(true);
  });
});
