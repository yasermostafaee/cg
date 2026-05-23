import { describe, expect, it } from 'vitest';
import { encodeBundle, encodeMessage } from '@cg/amcp-mock';
import { flatten, parsePacket, type OscBundle, type OscMessage } from '../src/osc/parser.js';

/**
 * The parser is a TS port of the M1 spike's reference parser
 * (`tools/spikes/osc-capture/osc.mjs`). We round-trip against the
 * amcp-mock encoder to guarantee wire compatibility.
 */

describe('OSC parser', () => {
  it('parses a single message', () => {
    const buf = encodeMessage({ address: '/channel/1/framerate', args: [50, 1] });
    const parsed = parsePacket(buf);
    expect(parsed).toMatchObject({
      kind: 'message',
      address: '/channel/1/framerate',
      args: [50, 1],
    });
  });

  it('parses a bundle of messages', () => {
    const buf = encodeBundle([
      { address: '/channel/1/framerate', args: [50, 1] },
      { address: '/channel/1/stage/layer/10/foreground/producer', args: ['html'] },
    ]);
    const parsed = parsePacket(buf) as OscBundle;
    expect(parsed.kind).toBe('bundle');
    expect(parsed.items).toHaveLength(2);
  });

  it('flatten recursively unwraps nested bundles', () => {
    const inner = encodeBundle([{ address: '/inner', args: [1] }]);
    // hand-construct an outer bundle that contains the inner one
    const outer = Buffer.concat([
      Buffer.from('#bundle\0', 'ascii'),
      Buffer.alloc(8, 0),
      sizeFor(inner),
      inner,
    ]);
    const flat = flatten(parsePacket(outer));
    expect(flat).toEqual([{ kind: 'message', address: '/inner', args: [1] }]);
  });

  it('returns null on an empty buffer', () => {
    expect(parsePacket(Buffer.alloc(0))).toBeNull();
  });

  it('marks a message with no type tag as malformed', () => {
    // address = '/x' + null + pad to 4 — no type tag follows
    const buf = Buffer.from([0x2f, 0x78, 0x00, 0x00]);
    const parsed = parsePacket(buf) as OscMessage;
    expect(parsed.kind).toBe('message');
    expect(parsed.args).toEqual([]);
  });

  it('preserves UTF-8 / Persian string args', () => {
    const buf = encodeMessage({ address: '/title', args: ['خبر فوری'] });
    const parsed = parsePacket(buf) as OscMessage;
    expect(parsed.args[0]).toBe('خبر فوری');
  });

  it('flatten returns an empty array for null', () => {
    expect(flatten(null)).toEqual([]);
  });
});

function sizeFor(buf: Buffer): Buffer {
  const sz = Buffer.alloc(4);
  sz.writeUInt32BE(buf.length, 0);
  return sz;
}
