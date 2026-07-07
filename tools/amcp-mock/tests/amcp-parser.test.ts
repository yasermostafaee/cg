import { describe, expect, it } from 'vitest';
import { parseAmcpLine } from '../src/amcp-parser.js';

describe('parseAmcpLine', () => {
  it('returns null on an empty line', () => {
    expect(parseAmcpLine('')).toBeNull();
    expect(parseAmcpLine('   ')).toBeNull();
  });

  it('parses a bare verb', () => {
    expect(parseAmcpLine('VERSION')).toEqual({ verb: 'VERSION', args: [], raw: 'VERSION' });
  });

  it('uppercases the verb but preserves arg case', () => {
    const r = parseAmcpLine('play 1-10 "MyFile.png"');
    expect(r?.verb).toBe('PLAY');
    expect(r?.args).toEqual(['1-10', 'MyFile.png']);
  });

  it('splits bare tokens on whitespace and tabs', () => {
    const r = parseAmcpLine('CG 1-10 ADD 0 mytemplate 1');
    expect(r?.args).toEqual(['1-10', 'ADD', '0', 'mytemplate', '1']);
  });

  it('unwraps quoted tokens with escaped quotes', () => {
    const r = parseAmcpLine('CG 1-10 INVOKE 0 "say \\"hi\\""');
    expect(r?.args).toEqual(['1-10', 'INVOKE', '0', 'say "hi"']);
  });

  it('tolerates an unterminated quote by consuming to end of line', () => {
    const r = parseAmcpLine('CG INVOKE "broken');
    expect(r?.args).toEqual(['INVOKE', 'broken']);
  });

  it('preserves UTF-8 / Persian inside quoted strings', () => {
    const r = parseAmcpLine('CG 1-10 INVOKE 0 "{\\"title\\":\\"خبر فوری\\"}"');
    expect(r?.args[3]).toBe('{"title":"خبر فوری"}');
  });

  it('strips trailing CR but not internal characters', () => {
    const r = parseAmcpLine('VERSION\r');
    expect(r?.raw).toBe('VERSION');
  });
});

/**
 * B-041 — `readQuoted` models the REAL CasparCG tokenizer (layer 1 of the
 * two-layer un-escape; hardware-confirmed on 2.5.0 `69e8ad5`): `\\` → `\`,
 * `\"` → `"`, `\n` → a RAW newline, and any other `\X` pair is silently
 * dropped. Decoding by the real rule — not the inverse of our own escaper — is
 * what lets the mock catch a wrongly-escaped emission.
 */
describe('readQuoted decodes per the real CasparCG tokenizer (B-041)', () => {
  it('un-escapes backslash-backslash to ONE backslash', () => {
    const r = parseAmcpLine('CG 1-10 UPDATE 0 "a\\\\b"');
    expect(r?.args[3]).toBe('a\\b');
  });

  it('un-escapes backslash-n to a RAW newline (the DP2 hardware signature)', () => {
    const r = parseAmcpLine('CG 1-10 UPDATE 0 "New text\\nsecond text"');
    expect(r?.args[3]).toBe('New text\nsecond text'); // raw 0x0A between the words
  });

  it('silently DROPS an unknown escape pair (sweep evidence: \\u000a arrived as 000a)', () => {
    const r = parseAmcpLine('CG 1-10 UPDATE 0 "New text\\u000asecond text"');
    expect(r?.args[3]).toBe('New text000asecond text');
  });

  it('drops a lone backslash + following char (it is NOT literal)', () => {
    // `a\b` on the wire: `\b` is an unknown pair → both characters dropped.
    const r = parseAmcpLine('CG 1-10 UPDATE 0 "a\\bc"');
    expect(r?.args[3]).toBe('ac');
  });

  it('drops a dangling trailing backslash', () => {
    const r = parseAmcpLine('CG 1-10 UPDATE 0 "abc\\');
    expect(r?.args[3]).toBe('abc');
  });
});

/**
 * B-041 regression proof at the tokenizer level: the failed #245 "quotes-only"
 * emission (escape `"` only, leave backslashes literal) puts a bare backslash-n
 * on the wire, which the real tokenizer — and now the mock — turns into a RAW
 * newline: the exact framing/V8-breaking value `cg-data.ts` then flags. The
 * correct two-layer emission decodes to the JS-layer string (backslashes still
 * doubled) which layer 2 restores to the original JSON.
 */
describe('readQuoted catches the broken escapings (B-041)', () => {
  const fields = { v: 'a\\b', nl: 'line1\nline2' };
  const json = JSON.stringify(fields);

  // The failed #245 rule: escape ONLY `"` → `\"` (backslashes literal).
  const quotesOnly = (s: string): string => s.replace(/"/g, '\\"');
  // The confirmed rule (winner js-escape+amcp-escape): double every backslash
  // (the JS layer), then double again + escape quotes (the AMCP layer).
  const twoLayer = (s: string): string =>
    s.replace(/\\/g, '\\\\').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  it('the quotes-only emission decodes with a RAW newline inside (the on-air bug)', () => {
    const arg = parseAmcpLine(`CG 1-10 UPDATE 0 "${quotesOnly(json)}"`)?.args[3];
    expect(arg).not.toBe(json);
    expect(arg).toContain('\n'); // raw 0x0A — breaks the update("…") V8 embed
  });

  it('the two-layer emission decodes to the JS-layer string (backslashes doubled, no raw LF)', () => {
    const arg = parseAmcpLine(`CG 1-10 UPDATE 0 "${twoLayer(json)}"`)?.args[3];
    expect(arg).toBe(json.replace(/\\/g, '\\\\'));
    expect(arg).not.toContain('\n');
  });
});
