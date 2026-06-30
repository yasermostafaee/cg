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

  it('unwraps quoted tokens with escaped quotes and backslashes', () => {
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

  it('treats a lone backslash as literal (CasparCG only escapes \\")', () => {
    // `\\b` on the wire is backslash + b — NOT an escaped anything; both literal.
    const r = parseAmcpLine('CG 1-10 UPDATE 0 "a\\b"');
    expect(r?.args[3]).toBe('a\\b');
  });
});

/**
 * B-041 — the mock un-quotes per REAL CasparCG (only `\"` → `"`, backslashes
 * literal), so it CATCHES a double-escaped payload instead of mirroring our own
 * escaper. A field value with a backslash + a quote, JSON-serialized:
 */
describe('readQuoted catches double-escaping (B-041)', () => {
  const fields = { v: 'a\\b', q: 'x"y' };
  const json = JSON.stringify(fields);

  // The B-041 fix: escape ONLY `"` → `\"` (backslashes literal).
  const correctEscape = (s: string): string => s.replace(/"/g, '\\"');
  // The OLD bug: escape `\` → `\\` AND `"` → `\"` (the redundant second pass).
  const oldEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  it('decodes the correctly single-escaped data arg back to the original JSON', () => {
    const arg = parseAmcpLine(`CG 1-10 UPDATE 0 "${correctEscape(json)}"`)?.args[3];
    expect(arg).toBe(json);
    expect(JSON.parse(arg ?? '')).toEqual(fields);
  });

  it('decodes the OLD double-escaped data arg to something OTHER than the original', () => {
    const arg = parseAmcpLine(`CG 1-10 UPDATE 0 "${oldEscape(json)}"`)?.args[3];
    // The mock no longer mirrors our escaper, so the double-escaped wire does NOT
    // decode back to the original JSON — an equality round-trip test would FAIL on it.
    expect(arg).not.toBe(json);
  });
});
