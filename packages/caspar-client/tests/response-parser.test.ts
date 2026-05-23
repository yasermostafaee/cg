import { describe, expect, it } from 'vitest';
import { AmcpResponseParser, type ParsedAmcpResponse } from '../src/amcp/response-parser.js';

function collect(input: string): ParsedAmcpResponse[] {
  const out: ParsedAmcpResponse[] = [];
  const parser = new AmcpResponseParser((r) => out.push(r));
  parser.feed(input);
  return out;
}

describe('AmcpResponseParser', () => {
  it('parses a 202 no-data ack', () => {
    expect(collect('202 PLAY\r\n')).toEqual([
      { kind: 'ok', code: 202, verb: 'PLAY', header: '202 PLAY' },
    ]);
  });

  it('parses a 201 one-line data ack', () => {
    expect(collect('201 VERSION OK\r\n2.3.2 Stable\r\n')).toEqual([
      {
        kind: 'ok-line',
        code: 201,
        verb: 'VERSION',
        header: '201 VERSION OK',
        data: '2.3.2 Stable',
      },
    ]);
  });

  it('parses a 200 multi-line ack terminated by blank line', () => {
    const out = collect('200 INFO OK\r\n1 PAL PLAYING\r\n2 NTSC PLAYING\r\n\r\n');
    expect(out).toEqual([
      {
        kind: 'ok-multi',
        code: 200,
        verb: 'INFO',
        header: '200 INFO OK',
        lines: ['1 PAL PLAYING', '2 NTSC PLAYING'],
      },
    ]);
  });

  it('parses an empty multi-line ack (header + immediate blank)', () => {
    const out = collect('200 INFO OK\r\n\r\n');
    expect(out).toEqual([
      { kind: 'ok-multi', code: 200, verb: 'INFO', header: '200 INFO OK', lines: [] },
    ]);
  });

  it('parses an error response', () => {
    expect(collect('404 ERROR\r\n')).toEqual([
      { kind: 'err', code: 404, verb: 'ERROR', header: '404 ERROR' },
    ]);
  });

  it('handles split chunks across feeds (partial header)', () => {
    const out: ParsedAmcpResponse[] = [];
    const parser = new AmcpResponseParser((r) => out.push(r));
    parser.feed('201 VER');
    expect(out).toEqual([]);
    parser.feed('SION OK\r\n2.3');
    expect(out).toEqual([]);
    parser.feed('.2\r\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'ok-line', code: 201, data: '2.3.2' });
  });

  it('handles split chunks across feeds (split on CR/LF boundary)', () => {
    const out: ParsedAmcpResponse[] = [];
    const parser = new AmcpResponseParser((r) => out.push(r));
    parser.feed('202 PLAY\r');
    parser.feed('\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'ok', code: 202 });
  });

  it('parses back-to-back responses in one feed', () => {
    const out = collect('202 PLAY\r\n202 CLEAR\r\n201 VERSION OK\r\n2.3.2\r\n');
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ kind: 'ok', verb: 'PLAY' });
    expect(out[1]).toMatchObject({ kind: 'ok', verb: 'CLEAR' });
    expect(out[2]).toMatchObject({ kind: 'ok-line', verb: 'VERSION', data: '2.3.2' });
  });

  it('drops garbage lines outside a response', () => {
    const out = collect('not-a-header\r\n202 PLAY\r\n');
    expect(out).toEqual([{ kind: 'ok', code: 202, verb: 'PLAY', header: '202 PLAY' }]);
  });

  it('drops a header with an out-of-range code', () => {
    const out = collect('99 BOGUS\r\n202 PLAY\r\n');
    expect(out).toEqual([{ kind: 'ok', code: 202, verb: 'PLAY', header: '202 PLAY' }]);
  });

  it('preserves UTF-8 / Persian text in a one-line data ack', () => {
    const out = collect('201 INFO OK\r\nخبر فوری\r\n');
    expect(out[0]).toMatchObject({ kind: 'ok-line', data: 'خبر فوری' });
  });

  it('preserves Persian lines in a multi-line ack', () => {
    const out = collect('200 INFO OK\r\nخط ۱\r\nخط ۲\r\n\r\n');
    expect(out[0]).toMatchObject({ kind: 'ok-multi', lines: ['خط ۱', 'خط ۲'] });
  });

  it('does not emit until CRLF arrives', () => {
    const out: ParsedAmcpResponse[] = [];
    const parser = new AmcpResponseParser((r) => out.push(r));
    parser.feed('202 PLAY');
    expect(parser.pendingBytes).toBeGreaterThan(0);
    expect(out).toEqual([]);
    parser.feed('\r\n');
    expect(parser.pendingBytes).toBe(0);
    expect(out).toHaveLength(1);
  });

  it('treats an unknown 1xx code as a best-effort ack', () => {
    expect(collect('101 NOTIFY\r\n')).toEqual([
      { kind: 'ok', code: 202, verb: 'NOTIFY', header: '101 NOTIFY' },
    ]);
  });
});
