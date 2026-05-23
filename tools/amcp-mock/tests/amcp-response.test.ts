import { describe, expect, it } from 'vitest';
import { serializeAmcpResponse } from '../src/amcp-response.js';

describe('serializeAmcpResponse', () => {
  it('serializes a 202 no-data ack', () => {
    expect(serializeAmcpResponse({ kind: 'ok', code: 202, verb: 'PLAY' })).toBe('202 PLAY\r\n');
  });

  it('serializes a 201 single-line data ack', () => {
    expect(
      serializeAmcpResponse({ kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2' }),
    ).toBe('201 VERSION OK\r\n2.3.2\r\n');
  });

  it('serializes a 200 multi-line data ack terminated by a blank line', () => {
    const out = serializeAmcpResponse({
      kind: 'ok-multi',
      code: 200,
      verb: 'INFO',
      lines: ['1 PAL PLAYING', '2 NTSC PLAYING'],
    });
    expect(out).toBe('200 INFO OK\r\n1 PAL PLAYING\r\n2 NTSC PLAYING\r\n\r\n');
  });

  it('serializes a 4xx error', () => {
    expect(serializeAmcpResponse({ kind: 'err', code: 404, verb: 'PLAY' })).toBe('404 ERROR\r\n');
  });

  it('appends optional detail to an error', () => {
    expect(
      serializeAmcpResponse({
        kind: 'err',
        code: 500,
        verb: 'CG',
        detail: 'internal',
      }),
    ).toBe('500 ERROR\r\ninternal\r\n');
  });
});
