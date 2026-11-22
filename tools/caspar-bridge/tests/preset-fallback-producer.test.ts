import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { AssetEntry, ControlLiveLayoutFrame, Manifest } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { PageStore } from '../src/page-store.js';
import {
  nativePresetProducerLayerState,
  resolveNativePresetFallback,
  resolveNativeStrokeTexture,
} from '../src/preset-fallback-producer.js';
import { TemplateRegistry } from '../src/template-registry.js';
import { zipEntries } from '../src/zip.js';

const FRAME = { id: 'guest', title: 'Guest' };
const TEMPLATE_URL = 'http://127.0.0.1:7911/template/latest?cgpass=background';
const RGB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAFElEQVR4nGM8kcLFgA0wYRUlSwIAeV4BPpvcQOYAAAAASUVORK5CYII=',
  'base64',
);
const RGBA_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAFUlEQVR4nGM8kcJVz4AHMOGTpI4CAOA+Ab0J/r92AAAAAElFTkSuQmCC',
  'base64',
);

async function fallbackPackage(
  bytes: Buffer,
  overrides: Partial<AssetEntry> = {},
): Promise<Buffer> {
  const mtime = new Date('2026-01-01T00:00:00.000Z');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const asset: AssetEntry = {
    id: 'control-live-layout-fallback-guest',
    path: 'assets/image/' + sha256 + '.png',
    kind: 'image',
    bytes: bytes.length,
    sha256,
    mime: 'image/png',
    ...overrides,
  };
  const manifest: Manifest = {
    schemaVersion: 1,
    format: 'vcg',
    formatVersion: '1.0',
    id: '51a09a24-9220-49d8-85aa-a2b3f2688746',
    name: 'Fallback layout',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    fields: [],
    fontDeps: [],
    assetIndex: [asset],
    integrity: { files: [{ path: asset.path, sha256, bytes: bytes.length }], root: sha256 },
    authoring: {
      designerVersion: '1.0.0',
      createdAt: mtime.toISOString(),
      exportedAt: mtime.toISOString(),
    },
    compatibility: { minRuntimeVersion: '1.0.0', minCasparCGVersion: '2.5.0' },
  };
  return zipEntries([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)), mtime },
    { name: asset.path, data: bytes, mtime },
  ]);
}

describe('native preset fallback producer', () => {
  it('renders an opaque, colour-matched perimeter and a fully transparent interior', async () => {
    const pages = new PageStore(null);
    const border = await resolveNativeStrokeTexture(
      pages,
      TEMPLATE_URL,
      { width: 23, height: 15 },
      { x: 2 / 23, y: 3 / 15 },
      '#4080c0',
    );
    if (border?.kind !== 'image') throw new Error('Missing stroke');
    const file = await pages.read(border.sha256);
    if (file === null) throw new Error('Missing stroke bytes');
    const bytes = file.bytes;
    const palette = bytes.indexOf('PLTE') + 4;
    const alpha = bytes.indexOf('tRNS') + 4;
    const data = bytes.indexOf('IDAT') + 4;
    expect([...bytes.subarray(palette, palette + 6)]).toEqual([0, 0, 0, 64, 128, 192]);
    expect([...bytes.subarray(alpha, alpha + 2)]).toEqual([0, 255]);
    const rows = inflateSync(bytes.subarray(data, data + bytes.readUInt32BE(data - 8)));
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 23; x++) {
        expect(!!(rows[y * 4 + 1 + Math.floor(x / 8)]! & (128 >> (x % 8)))).toBe(
          x < 2 || x >= 21 || y < 3 || y >= 12,
        );
      }
    }
  });
  it('resolves an opaque solid only when fallback is visible and unmasked', async () => {
    const pages = new PageStore(null);
    const readSource = vi.fn(() => null);
    const frame: ControlLiveLayoutFrame = {
      ...FRAME,
      fallback: { kind: 'color', color: '#223344FF' },
    };
    const resolve = (frame: ControlLiveLayoutFrame) =>
      resolveNativePresetFallback({ frame, readSource, pages, templateUrl: null });
    expect(await resolve(frame)).toEqual({ kind: 'color', color: '#223344' });
    expect(await resolve({ ...frame, showFallback: false })).toBeUndefined();
    expect(
      await resolve({ ...frame, fallback: { kind: 'color', color: '#22334480' } }),
    ).toBeUndefined();
    expect(
      await resolve({
        ...frame,
        liveMask: { mode: 'inside', rects: [{ x: 0, y: 0, width: 0.5, height: 0.5 }] },
      }),
    ).toBeUndefined();
    expect(readSource).not.toHaveBeenCalled();
    expect(pages.hashes()).toEqual([]);
  });

  it('stores one deterministic PNG for bars even when multiple plates request it together', async () => {
    const pages = new PageStore(null);
    const put = vi.spyOn(pages, 'put');
    const readSource = vi.fn(() => null);
    const args = {
      frame: { ...FRAME, showFallback: true },
      readSource,
      pages,
      templateUrl: TEMPLATE_URL,
    };
    const [first, second] = await Promise.all([
      resolveNativePresetFallback(args),
      resolveNativePresetFallback({ ...args, frame: { ...FRAME, fallback: { kind: 'bars' } } }),
    ]);
    if (first?.kind !== 'image') throw new Error('Bars image missing');
    expect(second).toEqual(first);
    expect(first.aspect).toBeNull();
    expect(first.url).toBe('http://127.0.0.1:7911/page/' + first.sha256 + '.png');
    expect(put).toHaveBeenCalledTimes(1);
    expect(readSource).not.toHaveBeenCalled();
    const stored = await pages.read(first.sha256);
    if (stored === null) throw new Error('Bars image not stored');
    const idatOffset = 8 + 25;
    const idatSize = stored.bytes.readUInt32BE(idatOffset);
    const raw = inflateSync(stored.bytes.subarray(idatOffset + 8, idatOffset + 8 + idatSize));
    expect(stored.mime).toBe('image/png');
    expect(raw[0]).toBe(0);
    expect(
      Array.from({ length: 7 }, (_, index) => raw.readUIntBE(1 + (index * 128 + 64) * 3, 3)),
    ).toEqual([0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0]);
  });

  it('serves the exact content-addressed poster and retains its intrinsic aspect', async () => {
    const source = await fallbackPackage(RGB_PNG);
    const pages = new PageStore(null);
    const result = await resolveNativePresetFallback({
      frame: { ...FRAME, fallback: { kind: 'image', name: 'Poster.png', mime: 'image/png' } },
      readSource: () => source,
      pages,
      templateUrl: TEMPLATE_URL,
    });
    if (result?.kind !== 'image') throw new Error('Verified image was refused');
    expect(result.aspect).toBe(2);
    expect(result.url).toBe('http://127.0.0.1:7911/page/' + result.sha256 + '.png');
    expect(await pages.read(result.sha256)).toEqual({ mime: 'image/png', bytes: RGB_PNG });
  });

  it('keeps transparent, mismatched and unsupported images on the authored page', async () => {
    const pages = new PageStore(null);
    const frame: ControlLiveLayoutFrame = {
      ...FRAME,
      fallback: { kind: 'image', name: 'Poster.png', mime: 'image/png' },
    };
    for (const source of [
      await fallbackPackage(RGBA_PNG),
      await fallbackPackage(RGB_PNG, { sha256: 'a'.repeat(64) }),
      await fallbackPackage(RGB_PNG, { id: 'different-frame' }),
      null,
    ]) {
      expect(
        await resolveNativePresetFallback({
          frame,
          readSource: () => source,
          pages,
          templateUrl: TEMPLATE_URL,
        }),
      ).toBeUndefined();
    }
    const readSource = vi.fn(() => null);
    expect(
      await resolveNativePresetFallback({
        frame: { ...frame, fallback: { kind: 'image', name: 'Poster.gif', mime: 'image/gif' } },
        readSource,
        pages,
        templateUrl: TEMPLATE_URL,
      }),
    ).toBeUndefined();
    expect(readSource).not.toHaveBeenCalled();
    expect(pages.hashes()).toEqual([]);
  });
});

describe('native preset fallback package lookup', () => {
  it('reads the exact resident version and refuses replaced on-disk bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cg-fallback-package-'));
    try {
      const first = new TemplateRegistry(dir);
      const packageBytes = await fallbackPackage(RGB_PNG);
      const saved = first.putSource(packageBytes);
      if (!saved.ok) throw new Error(saved.message);
      const info: TemplateInfo = {
        templateId: 'fallback-test',
        name: 'Fallback test',
        templateType: 'custom',
        fields: [],
      };
      const loaded = first.importOn([1, 2], info, '<main>Original</main>', {
        sourceSha256: saved.sha256,
      });
      const changed = first.importOn([1], info, '<main>Changed</main>');
      const reopened = new TemplateRegistry(dir);
      reopened.loadPersisted();
      expect(await reopened.readSourceForVersion(changed.versionId)).toBeNull();
      expect((await reopened.readSourceForVersion(loaded.versionId))?.equals(packageBytes)).toBe(
        true,
      );
      await writeFile(
        join(dir, 'template-sources', saved.sha256 + '.vcg'),
        Buffer.alloc(packageBytes.length),
      );
      expect(await reopened.readSourceForVersion(loaded.versionId)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('native preset producer stage ownership', () => {
  const image = {
    kind: 'image',
    url: 'http://127.0.0.1:7911/page/' + '0'.repeat(64) + '.png',
  } as const;
  const empty = '<producer>empty</producer>';
  const still =
    '<file><name>' +
    image.url +
    '</name><path>' +
    image.url +
    '</path></file><producer>ffmpeg</producer>';
  const different = still.replace('.png</path>', '.jpg</path>');
  const color = '<color>#33a0b2</color><producer>color</producer>';
  const stage = (foreground: string, background = empty) =>
    '<channel><stage><layer><layer_60><foreground>' +
    foreground +
    '</foreground><background>' +
    background +
    '</background></layer_60></layer></stage></channel>';

  it('accepts a warmed Focus dissolve only for its owned foreground and background routes', () => {
    const mix = { kind: 'focus-mix', channel: 2, outgoing: 67, incoming: 72, fields: 21 } as const;
    const route = (channel: number, layer: number) =>
      '<producer>route</producer><route><channel>' + channel + '</channel><layer>' + layer + '</layer></route>';
    const previous = route(2, 67);
    const next = route(2, 72);
    expect(nativePresetProducerLayerState(stage(previous, next), 60, mix)).toBe('native');
    expect(nativePresetProducerLayerState(stage(previous, route(1, 72)), 60, mix)).toBe('foreign');
    expect(nativePresetProducerLayerState(stage(previous, route(2, 79)), 60, mix)).toBe('foreign');
    expect(nativePresetProducerLayerState(stage(next, previous), 60, mix)).toBe('foreign');
  });

  it('proves a complete Focus group and its normalizer from the exact producer on the same engine', () => {
    const blackUri = 'http://127.0.0.1:7911/pages/black.png?take=t&plate=p';
    const group = { kind: 'focus-group', channel: 2, videoLayer: 71, matteLayer: 64, artworkLayer: 62, blackUri } as const;
    const normal = { kind: 'focus-normalize', channel: 2, sourceLayer: 65, holdFields: 30_000 } as const;
    const route = (layer: number) => '<route><channel>2</channel><layer>' + layer + '</layer></route>';
    const transit = (identity: string, type: string, index: number, fields: number) =>
      identity + '<producer>transition</producer><transition><frame>' + index + '</frame><frame>' + fields +
      '</frame><type>' + type + '</type></transition>';
    const file = '<file><name>black.png</name><path>' + blackUri.replace('&','&amp;') + '</path></file>';
    const current = transit(file, 'sting', 2, 600);
    expect(nativePresetProducerLayerState(stage(current), 60, group)).toBe('native');
    expect(nativePresetProducerLayerState(stage(transit(file,'sting',0,600)), 60, group)).toBe('native-pending');
    expect(nativePresetProducerLayerState(stage('<producer>route</producer>' + route(71)), 60, group)).toBe('native-pending');
    for (const other of [current.replace('plate=p','plate=q'), current.replace('>sting<','>mix<'),
      '<producer>route</producer>' + route(77), current.replace(file,'<color>#000000</color>')])
      expect(nativePresetProducerLayerState(stage(other),60,group)).toBe('foreign');
    const mixed = transit(route(65), 'mix', 7, 30_000);
    expect(nativePresetProducerLayerState(stage(mixed),60,normal)).toBe('native');
    expect(nativePresetProducerLayerState(stage('<producer>route</producer>'+route(65)),60,normal)).toBe('native-pending');
    for (const other of [mixed.replace('30000','30'), mixed.replace('>65<','>64<'), mixed.replace('>2<','>1<')])
      expect(nativePresetProducerLayerState(stage(other),60,normal)).toBe('foreign');
  });

  it('accepts the exact FFmpeg file URI regardless of whether it is pending or seated', () => {
    expect(nativePresetProducerLayerState(stage(still), 60, image)).toBe('native');
    expect(nativePresetProducerLayerState(stage(empty, still), 60, image)).toBe('native-pending');
    expect(nativePresetProducerLayerState(stage(still), 61, image)).toBe('empty');
    expect(nativePresetProducerLayerState('<invalid/>', 60, image)).toBe('foreign');
    expect(nativePresetProducerLayerState(stage(different), 60, image)).toBe('foreign');
    expect(nativePresetProducerLayerState(stage(still, color), 60, image)).toBe('foreign');
    expect(nativePresetProducerLayerState(stage(still.replace('ffmpeg', 'html')), 60, image)).toBe(
      'foreign',
    );
  });

  it('waits for an exact CasparCG 2.5 image cut to finish and rejects unrelated transitions', () => {
    const pending = still.replace(
      'ffmpeg</producer>',
      'transition</producer><transition><direction>from_left</direction>' +
        '<frame>0</frame><frame>0</frame><producer>ffmpeg</producer><type>cut</type></transition>',
    );
    expect(nativePresetProducerLayerState(stage(pending), 60, image)).toBe('native-pending');
    expect(nativePresetProducerLayerState(stage(empty, pending), 60, image)).toBe('native-pending');
    expect(nativePresetProducerLayerState(stage(pending, color), 60, image)).toBe('foreign');
    expect(
      nativePresetProducerLayerState(
        stage(pending.replace('.png</path>', '.jpg</path>')),
        60,
        image,
      ),
    ).toBe('foreign');
    expect(
      nativePresetProducerLayerState(stage(pending.replace('>cut<', '>mix<')), 60, image),
    ).toBe('foreign');
    expect(
      nativePresetProducerLayerState(stage(pending.replace('>0</frame>', '>1</frame>')), 60, image),
    ).toBe('foreign');
  });

  it('distinguishes exact native colours from other producers', () => {
    const expected = { kind: 'color', color: '#33A0B2' } as const;
    expect(nativePresetProducerLayerState(stage(color), 60, expected)).toBe('native');
    expect(nativePresetProducerLayerState(stage(still), 60, expected)).toBe('foreign');
    expect(nativePresetProducerLayerState(stage(empty), 60, expected)).toBe('empty');
  });

  it('reads the whole stage when a playlist route contains its own channel number', () => {
    const route =
      '<layer_62><foreground><producer>route</producer>' +
      '<route><channel>1</channel><layer>5</layer></route></foreground></layer_62>';
    const reply = stage(still).replace('</layer_60>', '</layer_60>' + route);
    expect(nativePresetProducerLayerState(reply, 60, image)).toBe('native');
    expect(nativePresetProducerLayerState(reply, 62, image)).toBe('foreign');
    expect(nativePresetProducerLayerState(reply, 63, image)).toBe('empty');
    const truncated = reply.slice(0, reply.indexOf('</channel>') + '</channel>'.length);
    expect(nativePresetProducerLayerState(truncated, 60, image)).toBe('foreign');
  });
});
