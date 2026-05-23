/**
 * OSC 1.0 packet parser — wire-compatible with what CasparCG 2.3.x emits.
 *
 * Supports:
 *   - Bundles (recursive) with timetag
 *   - Messages with type-tagged args
 *   - Argument types: int32 (`i`), float32 (`f`), string (`s`/`S`),
 *     blob (`b`), int64 (`h`), double (`d`), true/false/null/infinity
 *     (`T`/`F`/`N`/`I`)
 *
 * Skips an entire message's remaining args on encountering an unknown type
 * tag rather than throwing — corrupted single packets shouldn't kill the
 * UDP receiver.
 */

export type OscArgValue = number | string | boolean | null | Buffer | bigint;

export interface OscMessage {
  kind: 'message';
  address: string;
  args: readonly OscArgValue[];
  malformed?: string;
}

export interface OscBundle {
  kind: 'bundle';
  timetag: { sec: number; frac: number };
  items: readonly OscPacket[];
}

export type OscPacket = OscMessage | OscBundle;

const BUNDLE_HEADER = Buffer.from('#bundle\0', 'ascii');

/** Returns null when the buffer is too short or doesn't look like OSC. */
export function parsePacket(buf: Buffer): OscPacket | null {
  if (buf.length === 0) return null;
  if (buf.length >= 8 && buf.subarray(0, 8).equals(BUNDLE_HEADER)) {
    return parseBundle(buf);
  }
  return parseMessage(buf);
}

/** Recursively unwrap a packet to a flat array of `{address, args}`. */
export function flatten(packet: OscPacket | null): OscMessage[] {
  const out: OscMessage[] = [];
  walk(packet, out);
  return out;
}

function walk(packet: OscPacket | null, out: OscMessage[]): void {
  if (packet === null) return;
  if (packet.kind === 'message') {
    out.push(packet);
    return;
  }
  for (const item of packet.items) walk(item, out);
}

function parseBundle(buf: Buffer): OscBundle | null {
  if (buf.length < 16) return null;
  const timetagSec = buf.readUInt32BE(8);
  const timetagFrac = buf.readUInt32BE(12);
  const items: OscPacket[] = [];
  let offset = 16;
  while (offset < buf.length) {
    if (offset + 4 > buf.length) break;
    const size = buf.readUInt32BE(offset);
    offset += 4;
    if (offset + size > buf.length) break;
    const sub = buf.subarray(offset, offset + size);
    offset += size;
    const parsed = parsePacket(sub);
    if (parsed !== null) items.push(parsed);
  }
  return { kind: 'bundle', timetag: { sec: timetagSec, frac: timetagFrac }, items };
}

function parseMessage(buf: Buffer): OscMessage | null {
  const a = readString(buf, 0);
  if (a === null) return null;
  const address = a.value;
  let offset = a.next;

  if (offset >= buf.length) {
    return { kind: 'message', address, args: [] };
  }
  if (buf[offset] !== 0x2c /* , */) {
    return { kind: 'message', address, args: [], malformed: 'missing-type-tag' };
  }
  const t = readString(buf, offset);
  if (t === null) return { kind: 'message', address, args: [], malformed: 'bad-type-tag' };
  const typeTag = t.value;
  offset = t.next;

  const args: OscArgValue[] = [];
  for (const tag of typeTag.slice(1)) {
    if (offset > buf.length) break;
    switch (tag) {
      case 'i':
        if (offset + 4 > buf.length) break;
        args.push(buf.readInt32BE(offset));
        offset += 4;
        break;
      case 'f':
        if (offset + 4 > buf.length) break;
        args.push(buf.readFloatBE(offset));
        offset += 4;
        break;
      case 's':
      case 'S': {
        const r = readString(buf, offset);
        if (r === null) return { kind: 'message', address, args, malformed: 'bad-string-arg' };
        args.push(r.value);
        offset = r.next;
        break;
      }
      case 'b': {
        if (offset + 4 > buf.length) break;
        const size = buf.readUInt32BE(offset);
        offset += 4;
        if (offset + size > buf.length) break;
        const blob = buf.subarray(offset, offset + size);
        offset += size;
        while (offset % 4 !== 0) offset++;
        args.push(blob);
        break;
      }
      case 'h':
        if (offset + 8 > buf.length) break;
        args.push(buf.readBigInt64BE(offset));
        offset += 8;
        break;
      case 'd':
        if (offset + 8 > buf.length) break;
        args.push(buf.readDoubleBE(offset));
        offset += 8;
        break;
      case 'T':
        args.push(true);
        break;
      case 'F':
        args.push(false);
        break;
      case 'N':
        args.push(null);
        break;
      case 'I':
        args.push(Number.POSITIVE_INFINITY);
        break;
      default:
        return { kind: 'message', address, args, malformed: `unknown-type-tag:${tag}` };
    }
  }
  return { kind: 'message', address, args };
}

function readString(buf: Buffer, offset: number): { value: string; next: number } | null {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) return null;
  const value = buf.subarray(offset, end).toString('utf-8');
  let next = end + 1;
  while ((next - offset) % 4 !== 0) next++;
  return { value, next };
}
