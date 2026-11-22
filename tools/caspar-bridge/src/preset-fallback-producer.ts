import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PAGE_MAX_BYTES, PAGE_MAX_PIXELS } from '@cg/shared-ipc';
import { controlLiveLayoutShowFallback, type ControlLiveLayoutFrame } from '@cg/shared-schema';
import type { PagePutResult, PageStore } from './page-store.js';
import { nativePresetBorderColor } from './preset-border-mixer.js';
import { readVerifiedVcgImage } from './shared-template-thumbnail.js';
import { crc32 } from './zip.js';

export type NativePresetFallback =
  | { readonly kind: 'color'; readonly color: string }
  | {
      readonly kind: 'image';
      readonly url: string;
      /** A poster retains its aspect for cover; bars fill the plate. */
      readonly aspect: number | null;
      readonly sha256: string;
    };

export type NativeArtworkLayerProducer = NativePresetFallback | {
  readonly kind: 'artwork-route';
  readonly channel: number;
  readonly layer: number;
} | {
  readonly kind: 'focus-mix';
  readonly fields: number;
  readonly channel: number;
  readonly outgoing: number;
  readonly incoming: number;
} | {
  readonly kind: 'focus-page';
  readonly url: string;
} | {
  readonly kind: 'focus-group';
  readonly channel: number;
  readonly videoLayer: number;
  readonly matteLayer: number;
  readonly artworkLayer: number;
  readonly blackUri: string;
} | {
  readonly kind: 'focus-normalize';
  readonly channel: number;
  readonly sourceLayer: number;
  readonly holdFields: number;
} | {
  readonly kind: 'focus-matte';
  readonly channel: number;
  readonly sourceLayer: number;
};

type SolidOrImage =
  | { readonly kind: 'color'; readonly color: string }
  | {
      readonly kind: 'image';
      readonly url: string;
    } | Exclude<NativeArtworkLayerProducer, NativePresetFallback>;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The 75% bars match the authored programme fallback in buildLiveFallback.
const BAR_COLORS = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0];
let barsPng: Buffer | undefined;
const pendingPagePuts = new WeakMap<PageStore, Map<string, Promise<PagePutResult>>>();
const recentStrokePages = new WeakMap<PageStore, Map<string, string>>();

function pngChunk(name: string, bytes: Buffer): Buffer {
  const chunk = Buffer.alloc(bytes.length + 12);
  chunk.writeUInt32BE(bytes.length, 0);
  chunk.write(name, 4, 'ascii');
  bytes.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + bytes.length)), 8 + bytes.length);
  return chunk;
}

/** A transparent border texture can replace four mixer strips when a plate
 * keeps its aspect, even if there is only one free layer at the right depth.
 * Index zero is fully transparent. The bit-packed raster stays small in UHD. */
export async function resolveNativeStrokeTexture(
  pages: PageStore,
  templateUrl: string,
  raster: { width: number; height: number },
  thickness: { x: number; y: number },
  color: string,
): Promise<NativePresetFallback | undefined> {
  const { width, height } = raster;
  const x = Math.round(thickness.x * width);
  const y = Math.round(thickness.y * height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width * height > PAGE_MAX_PIXELS ||
    !(x > 0 && x * 2 < width && y > 0 && y * 2 < height) ||
    !/^#[0-9a-f]{6}$/i.test(color)
  )
    return undefined;
  const key = [width, height, x, y, color.toLowerCase()].join('/');
  let cached = recentStrokePages.get(pages);
  if (cached === undefined) {
    cached = new Map();
    recentStrokePages.set(pages, cached);
  }
  const stored = (sha256: string): Extract<NativePresetFallback, { kind: 'image' }> | undefined => {
    const path = pages.pathOf(sha256);
    return path === null
      ? undefined
      : { kind: 'image', sha256, aspect: null, url: new URL(path, templateUrl).href };
  };
  const previous = cached.get(key);
  if (previous !== undefined) {
    const existing = stored(previous);
    if (existing !== undefined) return existing;
  }
  const stride = 1 + Math.ceil(width / 8);
  const solid = Buffer.alloc(stride, 255);
  solid[0] = 0;
  const sides = Buffer.alloc(stride);
  for (let i = 0; i < x; i++) {
    for (const pixel of [i, width - 1 - i]) {
      const offset = 1 + Math.floor(pixel / 8);
      sides[offset] = (sides[offset] ?? 0) | (128 >> (pixel % 8));
    }
  }
  const pixels = Buffer.alloc(stride * height);
  for (let line = 0; line < height; line++)
    (line < y || line >= height - y ? solid : sides).copy(pixels, line * stride);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 1;
  header[9] = 3;
  const bytes = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('PLTE', Buffer.concat([Buffer.alloc(3), Buffer.from(color.slice(1), 'hex')])),
    pngChunk('tRNS', Buffer.from([0, 255])),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  const result = await putStill(pages, bytes, 'Plate border');
  if (!result.ok) return undefined;
  if (!cached.has(key) && cached.size >= 32) cached.delete(cached.keys().next().value!);
  cached.set(key, result.page.sha256);
  return stored(result.page.sha256);
}

function barsImage(): Buffer {
  if (barsPng !== undefined) return barsPng;
  const barWidth = 128;
  const width = BAR_COLORS.length * barWidth;
  const height = 32;
  const scanline = Buffer.alloc(1 + width * 3);
  BAR_COLORS.forEach((color, index) => {
    for (let pixel = index * barWidth; pixel < (index + 1) * barWidth; pixel += 1) {
      scanline.writeUIntBE(color, 1 + pixel * 3, 3);
    }
  });
  const pixels = Buffer.alloc(height * scanline.length);
  for (let row = 0; row < height; row += 1) scanline.copy(pixels, row * scanline.length);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  barsPng = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return barsPng;
}

/** This path uses one still texture with the same hard rectangular clip as the picture. */
function isOpaqueStaticPng(bytes: Buffer): boolean {
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    ![0, 2, 3].includes(bytes[25] ?? -1)
  ) {
    return false;
  }
  let offset = PNG_SIGNATURE.length;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    offset += length + 12;
    if (offset > bytes.length) return false;
    if (['acTL', 'fcTL', 'fdAT', 'tRNS', 'eXIf'].includes(kind)) return false;
    if (kind === 'IDAT' && length > 0) hasImageData = true;
    if (kind === 'IEND') return hasImageData && length === 0 && offset === bytes.length;
  }
  return false;
}

function isOpaqueStaticJpeg(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
  // Browser JPEGs may apply EXIF orientation before object-fit. Leave those on the page.
  return !bytes.includes(Buffer.from('Exif\0\0', 'ascii'));
}

function putStill(pages: PageStore, bytes: Buffer, name: string): Promise<PagePutResult> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let pending = pendingPagePuts.get(pages);
  if (pending === undefined) {
    pending = new Map();
    pendingPagePuts.set(pages, pending);
  }
  const current = pending.get(sha256);
  if (current !== undefined) return current;
  const puts = pending;
  const put = pages.put(bytes, name).finally(() => puts.delete(sha256));
  puts.set(sha256, put);
  return put;
}

/** Resolve a verified, bridge-served producer; unsupported artwork stays on the output page. */
export async function resolveNativePresetFallback({
  frame,
  readSource,
  pages,
  templateUrl,
}: {
  readonly frame: ControlLiveLayoutFrame;
  readonly readSource: () => Buffer | null | Promise<Buffer | null>;
  readonly pages: PageStore;
  readonly templateUrl: string | null | undefined;
}): Promise<NativePresetFallback | undefined> {
  if (!controlLiveLayoutShowFallback(frame) || frame.liveMask !== undefined) return undefined;
  const fallback = frame.fallback;
  if (fallback?.kind === 'color') {
    const color = nativePresetBorderColor(fallback.color);
    return color === undefined ? undefined : { kind: 'color', color };
  }
  if (templateUrl === undefined || templateUrl === null) return undefined;
  try {
    const origin = new URL(templateUrl);
    if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return undefined;
    let bytes: Buffer;
    let name: string;
    let cover = false;
    if (fallback === undefined || fallback.kind === 'bars') {
      bytes = barsImage();
      name = 'Colour bars';
    } else {
      if (fallback.mime !== 'image/png' && fallback.mime !== 'image/jpeg') return undefined;
      const source = await readSource();
      if (source === null) return undefined;
      const image = await readVerifiedVcgImage(
        source,
        source.length,
        'control-live-layout-fallback-' + frame.id,
        fallback.mime,
        PAGE_MAX_BYTES,
      );
      if (
        image === null ||
        !(fallback.mime === 'image/png' ? isOpaqueStaticPng(image) : isOpaqueStaticJpeg(image))
      ) {
        return undefined;
      }
      bytes = image;
      name = fallback.name;
      cover = true;
    }
    const result = await putStill(pages, bytes, name);
    if (!result.ok) return undefined;
    const { sha256, width, height } = result.page;
    const path = pages.pathOf(sha256);
    return path === null
      ? undefined
      : {
          kind: 'image',
          url: new URL(path, origin).href,
          aspect: cover ? width / height : null,
          sha256,
        };
  } catch {
    return undefined;
  }
}

/** Confirm ownership of both producer halves before bringing a texture up or clearing its slot. */
export function nativePresetProducerLayerState(
  xml: string,
  layer: number,
  expected: SolidOrImage,
): 'empty' | 'native' | 'native-pending' | 'foreign' {
  // A route:// producer reports <route><channel>N</channel> inside the stage.
  // Only the final closing tag belongs to the INFO channel itself.
  const channel = /<channel>([\s\S]*)<\/channel>\s*$/.exec(xml)?.[1];
  if (channel === undefined) return 'foreign';
  const stage = /<stage>([\s\S]*?)<\/stage>/.exec(channel)?.[1];
  if (stage === undefined && channel.includes('<stage>')) return 'foreign';
  const entry = new RegExp('<layer_' + layer + '>([\\s\\S]*?)</layer_' + layer + '>').exec(
    stage ?? '',
  )?.[1];
  if (entry === undefined) return 'empty';
  const foreground = /<foreground>([\s\S]*?)<\/foreground>/.exec(entry)?.[1];
  const background = /<background>([\s\S]*?)<\/background>/.exec(entry)?.[1];
  if (foreground === undefined && background === undefined) return 'foreign';
  const producer = (pass: string | undefined) =>
    /<producer>([^<]+)<\/producer>/i
      .exec(pass ?? '')?.[1]
      ?.trim()
      .toLowerCase();
  const stateOf = (pass: string | undefined): 'empty' | 'native' | 'native-pending' | 'foreign' => {
    const kind = producer(pass);
    if (pass === undefined || kind === 'empty') return 'empty';
    if (expected.kind === 'focus-group' || expected.kind === 'focus-normalize' || expected.kind === 'focus-matte') {
      const route = /<route>([\s\S]*?)<\/route>/i.exec(pass)?.[1] ?? '';
      const source = expected.kind === 'focus-group' ? expected.videoLayer : expected.sourceLayer;
      const ownRoute = Number(/<channel>(\d+)<\/channel>/.exec(route)?.[1]) === expected.channel &&
        Number(/<layer>(\d+)<\/layer>/.exec(route)?.[1]) === source;
      if (kind === 'route' && ownRoute) return expected.kind === 'focus-matte' ? 'native' : 'native-pending';
      if (expected.kind === 'focus-matte' || kind !== 'transition') return 'foreign';
      const transition = /<transition>([\s\S]*?)<\/transition>/i.exec(pass)?.[1] ?? '';
      const frames = [...transition.matchAll(/<frame>(\d+)<\/frame>/g)].map(match => Number(match[1]));
      if (frames.length !== 2 || frames[1]! <= 0 || frames[0]! > frames[1]!) return 'foreign';
      if (expected.kind === 'focus-group') {
        // INFO identifies STING by its destination. Each lease serves its
        // own black URI because the engine omits its matte and overlay URLs.
        const file = /<file>([\s\S]*?)<\/file>/i.exec(pass)?.[1] ?? '';
        const path = /<path>([^<]+)<\/path>/i.exec(file)?.[1]?.replaceAll('&amp;', '&');
        if (path !== expected.blackUri || !/<type>sting<\/type>/i.test(transition)) return 'foreign';
      } else if (!ownRoute || frames[1] !== expected.holdFields || !/<type>mix<\/type>/i.test(transition)) {
        return 'foreign';
      }
      return frames[0] === 0 ? 'native-pending' : 'native';
    }
    if (expected.kind === 'focus-mix') {
      const route = /<route>([\s\S]*?)<\/route>/i.exec(pass)?.[1] ?? '';
      const channel = Number(/<channel>(\d+)<\/channel>/.exec(route)?.[1]);
      const layer = Number(/<layer>(\d+)<\/layer>/.exec(route)?.[1]);
      if (
        channel !== expected.channel ||
        (layer !== expected.incoming && layer !== expected.outgoing)
      )
        return 'foreign';
      if (kind === 'route') return 'native';
      const transition = /<transition>([\s\S]*?)<\/transition>/.exec(pass)?.[1];
      return kind === 'transition' &&
        transition?.includes('<producer>route</producer>') &&
        /<type>(mix|cut)<\/type>/i.test(transition)
        ? 'native-pending'
        : 'foreign';
    }
    if (expected.kind === 'artwork-route') {
      const route = /<route>([\s\S]*?)<\/route>/i.exec(pass)?.[1] ?? '';
      return kind === 'route' &&
        Number(/<channel>(\d+)<\/channel>/.exec(route)?.[1]) === expected.channel &&
        Number(/<layer>(\d+)<\/layer>/.exec(route)?.[1]) === expected.layer
        ? 'native'
        : 'foreign';
    }
    if (expected.kind === 'color') {
      return kind === 'color' &&
        /<color>(#[0-9a-f]+)<\/color>/i.exec(pass)?.[1]?.toLowerCase() ===
          expected.color.toLowerCase()
        ? 'native'
        : 'foreign';
    }
    const path = /<file>[\s\S]*?<path>([^<]+)<\/path>[\s\S]*?<\/file>/i.exec(pass)?.[1]?.trim();
    if (expected.kind === 'focus-page')
      return kind === 'html' && path?.replaceAll('&amp;', '&') === expected.url ? 'native' : 'foreign';
    if (path !== expected.url) return 'foreign';
    if (kind === 'ffmpeg') return 'native';
    // CasparCG reports the destination file at the top level while a zero-frame
    // CUT is still being presented. Wait for the plain foreground before revealing it.
    const transition = /<transition>([\s\S]*?)<\/transition>/i.exec(pass)?.[1];
    return kind === 'transition' &&
      /^(?:<direction>[^<]+<\/direction>\s*)?(?:<frame>0<\/frame>\s*)+<producer>ffmpeg<\/producer>\s*<type>cut<\/type>$/i.test(
        transition?.trim() ?? '',
      )
      ? 'native-pending'
      : 'foreign';
  };
  const front = stateOf(foreground);
  const back = stateOf(background);
  // A Focus dissolve owns both halves of this transition. LOADBG has warmed
  // its destination while its original live source remains in the foreground.
  if (
    expected.kind === 'focus-mix' &&
    front === 'native' &&
    (back === 'native' || back === 'native-pending') &&
    foreground?.includes('<layer>' + expected.outgoing + '</layer>') &&
    background?.includes('<layer>' + expected.incoming + '</layer>')
  )
    return 'native';
  if (back === 'empty') return front;
  if (front === 'empty' && (back === 'native' || back === 'native-pending'))
    return 'native-pending';
  return 'foreign';
}
