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
});
