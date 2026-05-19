// Minimal OSC 1.0 parser — enough for CasparCG's emitted addresses.
// Handles: bundles, nested bundles, int32 (i), float32 (f), string (s),
// blob (b), big-int (h), double (d), true/false/null/infinity (T/F/N/I).
// Skips unknown type tags by aborting that message's argument parsing.

const BUNDLE_HEADER = Buffer.from('#bundle\0', 'ascii');

/**
 * Parse one OSC packet (bundle or message).
 * Returns null if the buffer is malformed.
 */
export function parsePacket(buf) {
  if (buf.length === 0) return null;
  if (buf.length >= 8 && buf.subarray(0, 8).equals(BUNDLE_HEADER)) {
    return parseBundle(buf);
  }
  return parseMessage(buf);
}

function parseBundle(buf) {
  if (buf.length < 16) return null;
  const timetagSec = buf.readUInt32BE(8);
  const timetagFrac = buf.readUInt32BE(12);
  const items = [];
  let offset = 16;
  while (offset < buf.length) {
    if (offset + 4 > buf.length) break;
    const size = buf.readUInt32BE(offset);
    offset += 4;
    if (offset + size > buf.length) break;
    const sub = buf.subarray(offset, offset + size);
    offset += size;
    const parsed = parsePacket(sub);
    if (parsed) items.push(parsed);
  }
  return { kind: 'bundle', timetag: { sec: timetagSec, frac: timetagFrac }, items };
}

function parseMessage(buf) {
  const a = readString(buf, 0);
  if (!a) return null;
  const address = a.value;
  let offset = a.next;

  // Type tag string starts with ',' (some buggy senders omit it; treat as empty args)
  if (offset >= buf.length) {
    return { kind: 'message', address, args: [] };
  }
  if (buf[offset] !== 0x2c /* ',' */) {
    return { kind: 'message', address, args: [], malformed: 'missing-type-tag' };
  }
  const t = readString(buf, offset);
  if (!t) return { kind: 'message', address, args: [], malformed: 'bad-type-tag' };
  const typeTag = t.value;
  offset = t.next;

  const args = [];
  for (const tag of typeTag.slice(1)) {
    if (offset > buf.length) break;
    switch (tag) {
      case 'i':
        args.push(buf.readInt32BE(offset));
        offset += 4;
        break;
      case 'f':
        args.push(buf.readFloatBE(offset));
        offset += 4;
        break;
      case 's':
      case 'S': {
        const r = readString(buf, offset);
        if (!r) return { kind: 'message', address, args, malformed: 'bad-string-arg' };
        args.push(r.value);
        offset = r.next;
        break;
      }
      case 'b': {
        if (offset + 4 > buf.length) break;
        const size = buf.readUInt32BE(offset);
        offset += 4;
        const blob = buf.subarray(offset, offset + size);
        offset += size;
        // pad to 4
        while (offset % 4 !== 0) offset++;
        args.push(blob);
        break;
      }
      case 'h':
        args.push(buf.readBigInt64BE(offset));
        offset += 8;
        break;
      case 'd':
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
        return {
          kind: 'message',
          address,
          args,
          malformed: `unknown-type-tag:${tag}`,
        };
    }
  }
  return { kind: 'message', address, args };
}

/** Reads a null-terminated string from `buf` starting at `offset`. Pads result to 4 bytes. */
function readString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) return null;
  const value = buf.subarray(offset, end).toString('utf-8');
  // advance past the null terminator and any padding to the next 4-byte boundary
  let next = end + 1;
  while ((next - offset) % 4 !== 0) next++;
  return { value, next };
}

/**
 * Flatten a parsed packet into a list of {address, args, timetag?} entries.
 * Bundles are recursively unwrapped.
 */
export function flatten(packet, accum = []) {
  if (!packet) return accum;
  if (packet.kind === 'message') {
    accum.push({ address: packet.address, args: packet.args });
    return accum;
  }
  if (packet.kind === 'bundle') {
    for (const item of packet.items) flatten(item, accum);
  }
  return accum;
}
