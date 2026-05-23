import { describe, expect, it } from 'vitest';
import { encodeBundle, encodeMessage } from '../src/osc-encode.js';

/**
 * Round-trip OSC: encode then decode via the M1 spike parser. If the two
 * agree on every observed CasparCG address, the mock is wire-compatible.
 */
import { parsePacket, flatten } from '../../spikes/osc-capture/osc.mjs';

describe('OSC encode', () => {
  it('encodes a string-arg message with correct null padding', () => {
    const buf = encodeMessage({
      address: '/channel/1/stage/layer/20/foreground/producer',
      args: ['html'],
    });
    expect(buf.length % 4).toBe(0);
    const parsed = parsePacket(buf);
    expect(parsed).toMatchObject({
      kind: 'message',
      address: '/channel/1/stage/layer/20/foreground/producer',
      args: ['html'],
    });
  });

  it('encodes mixed int + float + boolean args', () => {
    const buf = encodeMessage({
      address: '/channel/1/framerate',
      args: [50, 1, true],
    });
    const parsed = parsePacket(buf);
    expect(parsed).toMatchObject({
      address: '/channel/1/framerate',
      args: [50, 1, true],
    });
  });

  it('round-trips a bundle of multiple messages', () => {
    const buf = encodeBundle([
      { address: '/channel/1/framerate', args: [50, 1] },
      { address: '/channel/1/stage/layer/10/foreground/producer', args: ['empty'] },
      { address: '/channel/1/stage/layer/10/foreground/paused', args: [false] },
    ]);
    const flat = flatten(parsePacket(buf));
    expect(flat).toEqual([
      { address: '/channel/1/framerate', args: [50, 1] },
      { address: '/channel/1/stage/layer/10/foreground/producer', args: ['empty'] },
      { address: '/channel/1/stage/layer/10/foreground/paused', args: [false] },
    ]);
  });

  it('emits float32 for non-integer numbers', () => {
    const buf = encodeMessage({ address: '/x', args: [0.5] });
    const parsed = parsePacket(buf);
    // Float32 round-trip for 0.5 is exact.
    expect(parsed?.args[0]).toBe(0.5);
  });

  it('encodes UTF-8 string args losslessly (Persian round-trip)', () => {
    const buf = encodeMessage({ address: '/title', args: ['خبر فوری'] });
    const parsed = parsePacket(buf);
    expect(parsed?.args[0]).toBe('خبر فوری');
  });
});
