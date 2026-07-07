import { describe, expect, it } from 'vitest';
import { decodeCgData } from '../src/cg-data.js';

/**
 * B-041 — `decodeCgData` emulates the SECOND un-escape layer (html_cg_proxy
 * re-escapes quotes only → V8 parses the injected `update("…")` string literal)
 * over the tokenizer-decoded data argument, and flags the failure classes real
 * CasparCG hides behind a `202 CG OK`.
 */
describe('decodeCgData — delivery (the correct two-layer emission)', () => {
  it('restores the original JSON from the JS-layer string (backslashes doubled)', () => {
    const json = JSON.stringify({ v: 'a\\b', q: 'x"y', nl: 'line1\nline2' });
    // What the tokenizer hands over under the winning escaping: `\` still doubled.
    const decodedArg = json.replace(/\\/g, '\\\\');
    expect(decodeCgData(decodedArg)).toEqual({ data: json });
  });

  it('delivers a backslash-free JSON unchanged (identity through V8)', () => {
    const json = JSON.stringify({ title: 'خبر فوری ۱۴۰۳' });
    expect(decodeCgData(json)).toEqual({ data: json });
  });
});

describe('decodeCgData — rejection classes (what a 202 hides on hardware)', () => {
  it('flags a raw newline in the decoded arg (V8 SyntaxError; update never fires)', () => {
    // Exactly what the failed #245 quotes-only emission produces after layer 1.
    const r = decodeCgData('{"ttt":"New text\nsecond text"}');
    expect(r.data).toBeNull();
    expect(r.rejected?.reason).toBe('raw-control-char');
  });

  it('flags a raw CR too', () => {
    const r = decodeCgData('{"v":"a\rb"}');
    expect(r.rejected?.reason).toBe('raw-control-char');
  });

  it('backslash + raw LF is a V8 LineContinuation: fires with the pair swallowed (hardware-faithful)', () => {
    // Wire `\\\n` (3 backslashes + n) tokenizer-decodes to backslash + raw LF;
    // V8 parses that as a LineContinuation — the script is LEGAL, update fires,
    // and the pair contributes nothing. The mock delivers the corrupted payload
    // (like real CasparCG); a payload-equality assertion is what catches it.
    const r = decodeCgData('{"v":"a\\\nb"}');
    expect(r.rejected).toBeUndefined();
    expect(r.data).toBe('{"v":"ab"}');
  });

  it('flags a dangling trailing backslash (escapes the closing quote of update("…"))', () => {
    const r = decodeCgData('{"v":"x\\');
    expect(r.data).toBeNull();
    expect(r.rejected?.reason).toBe('js-syntax-error');
  });

  it('flags a backslash-then-quote sequence (closes the injected literal early)', () => {
    // decoded `\` + `"` → proxy re-escapes the quote → `\\` + `"` → V8 un-escapes
    // `\\` then hits a bare `"` that terminates update("…") mid-payload.
    const r = decodeCgData('{"v":"x\\"y"}');
    expect(r.rejected?.reason).toBe('js-syntax-error');
  });

  it('flags a malformed \\u escape (V8: invalid Unicode escape)', () => {
    const r = decodeCgData('{"v":"x\\uZZZZy"}');
    expect(r.rejected?.reason).toBe('js-syntax-error');
  });

  it('the pre-#245 double-escape with a quote value dies in the V8 layer', () => {
    // That emission's tokenizer decode restores the JSON byte-exact — then the
    // proxy re-escapes the quotes, V8 collapses the JSON's own `\\`, and the
    // now-bare `"` closes the injected literal early.
    const json = JSON.stringify({ q: 'x"y' });
    const r = decodeCgData(json); // (already tokenizer-decoded to exactly `json`)
    expect(r.data).toBeNull();
    expect(r.rejected?.reason).toBe('js-syntax-error');
  });

  it('surfaces a delivered value that fails the template’s JSON.parse', () => {
    // The pre-#245 double-escape with a newline value: V8 un-escapes the JSON's
    // OWN `\n` → a raw LF inside the delivered string → no longer valid JSON.
    const json = JSON.stringify({ nl: 'line1\nline2' });
    const r = decodeCgData(json); // (already tokenizer-decoded to exactly `json`)
    expect(r.data).toBeNull();
    expect(r.rejected?.reason).toBe('invalid-json');
  });

  it('flags an EMPTY data argument (the template’s JSON.parse would throw)', () => {
    expect(decodeCgData('').rejected?.reason).toBe('invalid-json');
  });
});
