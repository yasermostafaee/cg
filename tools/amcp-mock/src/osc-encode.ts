import type { OscArgValue } from './types.js';

/** OSC 1.0 message + bundle encoder. Strings are UTF-8; numbers float32. */

const BUNDLE_HEADER = Buffer.from('#bundle\0', 'ascii');

export interface OscMessage {
  address: string;
  args: readonly OscArgValue[];
}

/**
 * Encode a single OSC message into wire bytes.
 *
 * Type tags:
 *  - number  → `f` (float32) — CasparCG emits framerate as ints but most
 *              broadcast OSC consumers expect floats, so we keep it uniform.
 *              Integer-looking args use `i` (int32) to match observed traces.
 *  - string  → `s`
 *  - boolean → `T`/`F`
 */
export function encodeMessage(msg: OscMessage): Buffer {
  const addr = encodeString(msg.address);
  const typeTagChars: string[] = [];
  const argPayloads: Buffer[] = [];

  for (const a of msg.args) {
    if (typeof a === 'number') {
      if (Number.isInteger(a) && a >= -0x80000000 && a <= 0x7fffffff) {
        typeTagChars.push('i');
        const b = Buffer.alloc(4);
        b.writeInt32BE(a, 0);
        argPayloads.push(b);
      } else {
        typeTagChars.push('f');
        const b = Buffer.alloc(4);
        b.writeFloatBE(a, 0);
        argPayloads.push(b);
      }
    } else if (typeof a === 'string') {
      typeTagChars.push('s');
      argPayloads.push(encodeString(a));
    } else {
      typeTagChars.push(a ? 'T' : 'F');
    }
  }

  const typeTag = encodeString(',' + typeTagChars.join(''));
  return Buffer.concat([addr, typeTag, ...argPayloads]);
}

/**
 * Encode a bundle. `timetag` defaults to "immediate" (all-ones lower 32 bits
 * with seconds = 0), which CasparCG itself uses.
 */
export function encodeBundle(
  messages: readonly OscMessage[],
  timetag?: { sec: number; frac: number },
): Buffer {
  const tt = timetag ?? { sec: 0, frac: 1 };
  const ttBuf = Buffer.alloc(8);
  ttBuf.writeUInt32BE(tt.sec, 0);
  ttBuf.writeUInt32BE(tt.frac, 4);

  const parts: Buffer[] = [BUNDLE_HEADER, ttBuf];
  for (const m of messages) {
    const body = encodeMessage(m);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(body.length, 0);
    parts.push(size, body);
  }
  return Buffer.concat(parts);
}

/** Encode a UTF-8 string with null terminator, padded to a 4-byte boundary. */
function encodeString(s: string): Buffer {
  const raw = Buffer.from(s, 'utf-8');
  const totalLen = padTo4(raw.length + 1);
  const buf = Buffer.alloc(totalLen);
  raw.copy(buf, 0);
  return buf;
}

function padTo4(n: number): number {
  return (n + 3) & ~3;
}
