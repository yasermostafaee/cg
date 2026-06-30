import { describe, expect, it } from 'vitest';
import { escape, quote } from '../src/amcp/escape.js';

/**
 * B-041 — the canonical AMCP quoter. CasparCG 2.3.x un-escapes ONLY `\"` → `"`
 * inside `"…"`; every other char (incl. `\`) is literal. So `escape()` escapes
 * `"` → `\"` and leaves backslashes ALONE — no doubling (the old bug). The data
 * argument is already a `JSON.stringify` string, so this single pass is all the
 * wire needs.
 *
 * `casparUnquote` below models the real CasparCG un-escape, so the round-trip
 * assertions prove the quoter against the actual rule (not against itself).
 */

/** Model of CasparCG 2.3.x quoted-string un-escaping: only `\"` → `"`, else literal. */
function casparUnquote(wire: string): string {
  // Strip the wrapping quotes the quoter added.
  const body = wire.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && body[i + 1] === '"') {
      out += '"';
      i++;
      continue;
    }
    out += body[i];
  }
  return out;
}

describe('escape — exact wire bytes (no backslash doubling)', () => {
  it('passes plain ASCII + Persian through unchanged', () => {
    expect(escape('hello')).toBe('hello');
    expect(escape('خبر فوری')).toBe('خبر فوری');
    expect(escape('')).toBe('');
  });

  it('escapes a double-quote as \\" (the one CasparCG escape)', () => {
    expect(escape('a"b')).toBe('a\\"b');
  });

  it('leaves backslashes LITERAL — 1, 2, 3, 4 (never doubled)', () => {
    expect(escape('a\\b')).toBe('a\\b'); // 1
    expect(escape('a\\\\b')).toBe('a\\\\b'); // 2
    expect(escape('a\\\\\\b')).toBe('a\\\\\\b'); // 3
    expect(escape('a\\\\\\\\b')).toBe('a\\\\\\\\b'); // 4
  });

  it('maps raw newline / CR to a space (cannot ride a single AMCP line)', () => {
    expect(escape('a\nb')).toBe('a b');
    expect(escape('a\rb')).toBe('a b');
  });

  it('leaves a tab literal', () => {
    expect(escape('a\tb')).toBe('a\tb');
  });

  it('a JSON-escaped value passes through with ONLY its structural quotes escaped', () => {
    // JSON.stringify already produced `\"` (for a value quote) and `\\` (for a
    // backslash); escape() must NOT touch those backslashes, only escape every `"`.
    const json = JSON.stringify({ t: 'a"b\\c' }); // {"t":"a\"b\\c"}
    // For a JSON payload (no raw newline), escape() == "escape every quote", nothing
    // more — proving the backslashes JSON already emitted are left untouched.
    expect(escape(json)).toBe(json.replace(/"/g, '\\"'));
  });
});

describe('quote — round-trips byte-exact under the CasparCG rule', () => {
  it('wraps + escapes only quotes', () => {
    expect(quote('hello')).toBe('"hello"');
    expect(quote('say "hi"')).toBe('"say \\"hi\\""');
    expect(quote('C:\\Path')).toBe('"C:\\Path"'); // backslash NOT doubled
  });

  // The real test: a field value with special chars, JSON-serialized, quoted for
  // the wire, then un-quoted by CasparCG's rule + JSON.parse must equal the original.
  const values: Record<string, string> = {
    quote: 'a"b',
    backslash1: 'a\\b',
    backslash2: 'a\\\\b',
    backslash3: 'a\\\\\\b',
    backslash4: 'a\\\\\\\\b',
    newline: 'line1\nline2',
    tab: 'a\tb',
    combo: 'he said "a\\b"\nرفت',
    persian: 'خبر فوری ۱۴۰۳',
  };

  for (const [name, value] of Object.entries(values)) {
    it(`round-trips a value containing: ${name}`, () => {
      const fields = { v: value };
      const wire = quote(JSON.stringify(fields));
      const decoded = casparUnquote(wire);
      // Decoded wire equals the original JSON string byte-exact…
      expect(decoded).toBe(JSON.stringify(fields));
      // …and JSON.parse recovers the value byte-exact. (The value's newline reached
      // JSON.stringify as the 2-char `\n` BEFORE escape() — so it passes through and
      // round-trips, never hitting escape()'s raw-newline→space branch.)
      expect((JSON.parse(decoded) as { v: string }).v).toBe(value);
    });
  }
});
