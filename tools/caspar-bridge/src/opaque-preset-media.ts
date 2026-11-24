import { open } from 'node:fs/promises';
import { isAbsolute, win32 } from 'node:path';
import type { NormalizedRect } from '@cg/shared-schema';

const MAX_METADATA = 1024 * 1024;
const FINGERPRINT = /^[0-9a-f]{64}$/i;

interface Element {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly unknown: boolean;
}

function readVint(
  bytes: Buffer,
  offset: number,
  maxWidth: number,
  retainMarker: boolean,
): { value: number; width: number; unknown: boolean } | undefined {
  const first = bytes[offset] ?? 0;
  if (first === 0) return undefined;
  let marker = 0x80;
  let width = 1;
  while ((first & marker) === 0) {
    marker >>= 1;
    width++;
  }
  if (width > maxWidth || offset + width > bytes.length) return undefined;
  let value = retainMarker ? first : first & (marker - 1);
  let unknown = !retainMarker && value === marker - 1;
  for (let i = 1; i < width; i++) {
    const byte = bytes.readUInt8(offset + i);
    value = value * 256 + byte;
    unknown &&= byte === 0xff;
  }
  return Number.isSafeInteger(value) || unknown ? { value, width, unknown } : undefined;
}

function elementAt(bytes: Buffer, offset: number, limit: number): Element | undefined {
  if (offset < 0 || offset >= limit) return undefined;
  const id = readVint(bytes, offset, 4, true);
  if (id === undefined) return undefined;
  const size = readVint(bytes, offset + id.width, 8, false);
  if (size === undefined) return undefined;
  const start = offset + id.width + size.width;
  if (start > limit) return undefined;
  return {
    id: id.value,
    start,
    end: size.unknown ? limit : start + size.value,
    unknown: size.unknown,
  };
}

function children(bytes: Buffer, parent: Element): Element[] | undefined {
  if (parent.unknown || parent.end > bytes.length) return undefined;
  const entries: Element[] = [];
  let cursor = parent.start;
  while (cursor < parent.end) {
    const entry = elementAt(bytes, cursor, parent.end);
    if (entry === undefined || entry.unknown || entry.end > parent.end) return undefined;
    entries.push(entry);
    cursor = entry.end;
  }
  return entries;
}

function only(entries: readonly Element[], id: number): Element | undefined {
  const matches = entries.filter((entry) => entry.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

function uint(bytes: Buffer, value: Element | undefined): number | undefined {
  if (value === undefined || value.end - value.start > 4 || value.start === value.end)
    return undefined;
  return bytes.readUIntBE(value.start, value.end - value.start);
}

function noUnsignedFlags(bytes: Buffer, entries: readonly Element[], id: number): boolean {
  const flags = entries.filter((entry) => entry.id === id);
  return flags.length === 0 || (flags.length === 1 && uint(bytes, flags[0]) === 0);
}

function plainHevc(configuration: Buffer): boolean {
  if (
    configuration.length < 24 ||
    configuration[0] !== 1 ||
    ![1, 2].includes(configuration.readUInt8(1) & 31) ||
    (configuration.readUInt8(16) & 3) !== 1
  )
    return false;
  const parameterSets = new Set<number>();
  let offset = 23;
  const arrays = configuration.readUInt8(22);
  for (let array = 0; array < arrays; array++) {
    if (offset + 3 > configuration.length) return false;
    const type = configuration.readUInt8(offset) & 63;
    const count = configuration.readUInt16BE(offset + 1);
    if (![32, 33, 34, 39, 40].includes(type) || count === 0) return false;
    offset += 3;
    for (let index = 0; index < count; index++) {
      if (offset + 2 > configuration.length) return false;
      const length = configuration.readUInt16BE(offset);
      offset += 2;
      if (length < 3 || offset + length > configuration.length) return false;
      const first = configuration.readUInt8(offset);
      const second = configuration.readUInt8(offset + 1);
      if ((first & 0x81) !== 0 || second >> 3 !== 0 || (second & 7) === 0 || first >> 1 !== type)
        return false;
      if (type === 32) {
        // A VPS with a nonzero vps_max_layers_minus1 can carry an auxiliary alpha layer.
        if (
          length < 4 ||
          (configuration.readUInt8(offset + 2) & 3) !== 0 ||
          configuration.readUInt8(offset + 3) >> 4 !== 0
        )
          return false;
      }
      parameterSets.add(type);
      offset += length;
    }
  }
  return offset === configuration.length && [32, 33, 34].every((type) => parameterSets.has(type));
}

function plainAvc(configuration: Buffer): boolean {
  if (configuration.length < 11 || configuration[0] !== 1) return false;
  const profile = configuration.readUInt8(1);
  if (![66, 77, 100, 110].includes(profile)) return false;
  let offset = 6;
  const read = (count: number, type: number): boolean => {
    if (count === 0) return false;
    for (let index = 0; index < count; index++) {
      if (offset + 2 > configuration.length) return false;
      const length = configuration.readUInt16BE(offset);
      offset += 2;
      if (
        length < 2 ||
        offset + length > configuration.length ||
        (configuration.readUInt8(offset) & 0x9f) !== type
      )
        return false;
      offset += length;
    }
    return true;
  };
  if (!read(configuration.readUInt8(5) & 31, 7) || offset === configuration.length) return false;
  if (!read(configuration.readUInt8(offset++), 8)) return false;
  // A high-profile extension may declare chroma and bit depth. Reject an auxiliary SPS.
  return (
    offset === configuration.length ||
    ([100, 110].includes(profile) &&
      configuration.length - offset === 4 &&
      (configuration.readUInt8(offset) & 3) === 1 &&
      configuration[offset + 3] === 0)
  );
}

function plainVideoTracks(bytes: Buffer, tracks: Element): boolean {
  const entries = children(bytes, tracks);
  if (entries === undefined) return false;
  let videoFound = false;
  for (const track of entries.filter(({ id }) => id === 0xae)) {
    const fields = children(bytes, track);
    if (fields === undefined) return false;
    const type = uint(bytes, only(fields, 0x83));
    if (type === undefined || type === 0) return false;
    if (type !== 1) continue;
    if (
      videoFound ||
      fields.some(({ id }) => id === 0x41e4 || id === 0xe2 || id === 0x6d80) ||
      !noUnsignedFlags(bytes, fields, 0x55ee)
    )
      return false;
    const video = only(fields, 0xe0);
    const codec = only(fields, 0x86);
    const privateData = only(fields, 0x63a2);
    if (video === undefined || codec === undefined || privateData === undefined) return false;
    const geometry = children(bytes, video);
    if (
      geometry === undefined ||
      (uint(bytes, only(geometry, 0xb0)) ?? 0) === 0 ||
      (uint(bytes, only(geometry, 0xba)) ?? 0) === 0 ||
      !noUnsignedFlags(bytes, geometry, 0x53c0)
    )
      return false;
    const data = bytes.subarray(privateData.start, privateData.end);
    const identifier = bytes.toString('ascii', codec.start, codec.end);
    if (
      !(
        (identifier === 'V_MPEGH/ISO/HEVC' && plainHevc(data)) ||
        (identifier === 'V_MPEG4/ISO/AVC' && plainAvc(data))
      )
    )
      return false;
    videoFound = true;
  }
  return videoFound;
}

/** Accept only a declared single-layer opaque AVC/HEVC Matroska video track. */
export function plainMatroskaVideoOfPrefix(bytes: Buffer): boolean {
  const head = elementAt(bytes, 0, bytes.length);
  if (head?.id !== 0x1a45dfa3) return false;
  const header = children(bytes, head);
  const type = header === undefined ? undefined : only(header, 0x4282);
  if (type === undefined || bytes.toString('ascii', type.start, type.end) !== 'matroska')
    return false;
  const segment = elementAt(bytes, head.end, bytes.length);
  if (segment?.id !== 0x18538067) return false;
  let offset = segment.start;
  const limit = Math.min(segment.end, bytes.length);
  while (offset < limit) {
    const entry = elementAt(bytes, offset, limit);
    if (entry === undefined || entry.unknown || entry.end > limit) return false;
    if (entry.id === 0x1654ae6b) return plainVideoTracks(bytes, entry);
    if (entry.id === 0x1f43b675) return false;
    offset = entry.end;
  }
  return false;
}

/** The ready foreground is the fingerprinted replica or the exact local catalogue file. */
export function establishedFingerprintFile(
  xml: string,
  layer: number,
  fingerprint: string,
  engineCatalogueFile?: string,
): string | undefined {
  if (!FINGERPRINT.test(fingerprint)) return undefined;
  const foreground = foregroundAt(xml, layer);
  if (foreground === undefined || producerOf(foreground) !== 'ffmpeg') return undefined;
  const path = /<file>[\s\S]*?<path>([^<]+)<\/path>/.exec(foreground)?.[1]?.trim();
  if (
    path === undefined ||
    path.includes('&') ||
    Array.from(path).some((character) => character.charCodeAt(0) < 32) ||
    path.startsWith('\\\\') ||
    path.startsWith('//') ||
    !(isAbsolute(path) || /^[a-z]:[/\\]/i.test(path)) ||
    !path.toLowerCase().endsWith('.mkv')
  )
    return undefined;
  const basename = win32.basename(path).toLowerCase();
  if (/^[a-f0-9]{64}\.mkv$/.test(basename))
    return basename === fingerprint.toLowerCase() + '.mkv' ? path : undefined;
  if (engineCatalogueFile === undefined) return undefined;
  // The supplied path is this engine's D11 entry for the fingerprint. A named
  // file from another engine's catalogue does not identify this foreground.
  if (/^[a-z]:[/\\]/i.test(path) && /^[a-z]:[/\\]/i.test(engineCatalogueFile))
    return win32.normalize(path).toLowerCase() ===
      win32.normalize(engineCatalogueFile).toLowerCase()
      ? path
      : undefined;
  return path === engineCatalogueFile ? path : undefined;
}

function foregroundAt(xml: string, layer: number): string | undefined {
  if (!Number.isSafeInteger(layer) || layer < 0) return undefined;
  const stage = /<stage>([\s\S]*?)<\/stage>/.exec(xml)?.[1] ?? '';
  const block = new RegExp('<layer_' + layer + '>([\\s\\S]*?)</layer_' + layer + '>').exec(
    stage,
  )?.[1];
  return /<foreground>([\s\S]*?)<\/foreground>/.exec(block ?? '')?.[1];
}

function producerOf(block: string): string | undefined {
  return /<producer>([^<]+)<\/producer>/.exec(block)?.[1]?.trim();
}

/** The seated route's own producer reports the holder on this engine. */
export function establishedRouteSource(
  xml: string,
  layer: number,
): { channel: number; layer: number } | undefined {
  const foreground = foregroundAt(xml, layer);
  if (foreground === undefined || producerOf(foreground) !== 'route') return undefined;
  const route = /<route>([\s\S]*?)<\/route>/.exec(foreground)?.[1];
  if (route === undefined) return undefined;
  const channel = /<channel>\s*([1-9]\d*)\s*<\/channel>/.exec(route)?.[1];
  const target = /<layer>\s*(\d+)\s*<\/layer>/.exec(route)?.[1];
  if (channel === undefined || target === undefined) return undefined;
  const source = { channel: Number(channel), layer: Number(target) };
  return Number.isSafeInteger(source.channel) && Number.isSafeInteger(source.layer)
    ? source
    : undefined;
}

function decodedVideoAge(foreground: string): number | undefined {
  const counters = /<media>([\s\S]*?)<\/media>/.exec(foreground)?.[1];
  if (counters === undefined || !/<video-frames>\s*[1-9]\d*\s*<\/video-frames>/.test(counters))
    return undefined;
  const age = /<video-age-ms>\s*(\d+)\s*<\/video-age-ms>/.exec(counters)?.[1];
  return age === undefined ? undefined : Number(age);
}

/** Playout's INFO extension witnesses recent decoded video on the actual playlist holder. */
export function establishedPlaylistVideoFrame(xml: string, layer: number): boolean {
  const foreground = foregroundAt(xml, layer);
  if (foreground === undefined || producerOf(foreground) !== 'ffmpeg') return false;
  return (decodedVideoAge(foreground) ?? Infinity) <= 500;
}

/** A decoded frame on the exact NDI sender, including the core's ordinary CUT wrapper. */
export function establishedNdiVideoFrame(xml: string, layer: number, sender: string): boolean {
  const foreground = foregroundAt(xml, layer);
  if (foreground === undefined) return false;
  const transition = /<transition>([\s\S]*?)<\/transition>/.exec(foreground);
  const top = transition ? foreground.replace(transition[0], '') : foreground;
  const transitionBody = transition?.[1];
  const producer = producerOf(top);
  if (
    producer !== 'ndi' &&
    !(
      producer === 'transition' &&
      transitionBody !== undefined &&
      producerOf(transitionBody) === 'ndi' &&
      /<type>cut<\/type>/.test(transitionBody)
    )
  )
    return false;
  const ndi = /<ndi>([\s\S]*?)<\/ndi>/.exec(top)?.[1];
  const name = /<name>([^<]+)<\/name>/.exec(ndi ?? '')?.[1];
  if (name === undefined) return false;
  const decoded = name
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
  return decoded === sender && (decodedVideoAge(top) ?? Infinity) < 500;
}

export async function probeOpaqueMatroska(path: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const acquired = (async (): Promise<boolean> => {
    try {
      const file = await open(path, 'r');
      try {
        if (signal.aborted || !(await file.stat()).isFile()) return false;
        const prefix = Buffer.allocUnsafe(MAX_METADATA);
        const { bytesRead } = await file.read(prefix, 0, prefix.length, 0);
        return !signal.aborted && plainMatroskaVideoOfPrefix(prefix.subarray(0, bytesRead));
      } finally {
        await file.close();
      }
    } catch {
      return false;
    }
  })();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<false>((resolve) => {
    onAbort = () => resolve(false);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([acquired, aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
}

/** Both mixer transforms cover the authored plate within one output pixel. */
export function opaqueFitCoversPlate(
  fit: { readonly fill: NormalizedRect; readonly clip: NormalizedRect },
  rect: NormalizedRect,
  raster: { readonly width: number; readonly height: number },
): boolean {
  const x = 1 / raster.width;
  const y = 1 / raster.height;
  return [fit.fill, fit.clip].every(
    (box) =>
      box.x <= rect.x + x &&
      box.y <= rect.y + y &&
      box.x + box.width >= rect.x + rect.width - x &&
      box.y + box.height >= rect.y + rect.height - y,
  );
}
