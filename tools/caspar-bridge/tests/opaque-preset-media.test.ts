import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  establishedFingerprintFile,
  establishedPlaylistVideoFrame,
  establishedNdiVideoFrame,
  establishedRouteSource,
  opaqueFitCoversPlate,
  plainMatroskaVideoOfPrefix,
  probeOpaqueMatroska,
} from '../src/opaque-preset-media.js';

const FINGERPRINT = 'af'.repeat(32);
const mkvPath = 'C:/Engine/cache/' + FINGERPRINT + '.mkv';

function element(id: string, ...parts: Buffer[]): Buffer {
  const payload = Buffer.concat(parts);
  return Buffer.concat([
    Buffer.from(id, 'hex'),
    payload.length < 127
      ? Buffer.from([0x80 | payload.length])
      : Buffer.from([0x40 | (payload.length >> 8), payload.length & 0xff]),
    payload,
  ]);
}

function hevc(layer: number, auxiliaryVps: boolean): Buffer {
  const header = Buffer.alloc(23);
  header[0] = 1;
  header[1] = 2;
  header[16] = 1;
  header[22] = 3;
  return Buffer.concat([
    header,
    Buffer.from([32, 0, 1, 0, 4, 64, 1, 12, auxiliaryVps ? 0x10 : 0]),
    Buffer.from([33, 0, 1, 0, 3, 66, (layer << 3) | 1, 1]),
    Buffer.from([34, 0, 1, 0, 3, 68, 1, 1]),
  ]);
}

function track(
  codec: string,
  configuration: Buffer,
  options: { alpha?: boolean; additionalData?: boolean } = {},
): Buffer {
  return element(
    'ae',
    element('83', Buffer.of(1)),
    element('86', Buffer.from(codec)),
    element('63a2', configuration),
    element(
      'e0',
      element('b0', Buffer.of(160)),
      element('ba', Buffer.of(90)),
      ...(options.alpha ? [element('53c0', Buffer.of(1))] : []),
    ),
    ...(options.additionalData ? [element('55ee', Buffer.of(1))] : []),
  );
}

function mkv(...tracks: Buffer[]): Buffer {
  return Buffer.concat([
    element('1a45dfa3', element('4282', Buffer.from('matroska'))),
    element('18538067', element('1654ae6b', ...tracks)),
  ]);
}

const video = () => track('V_MPEGH/ISO/HEVC', hevc(0, false));
const stage = (path: string, kind = 'ffmpeg', layer = 61) =>
  '<channel><stage><layer_' +
  layer +
  '><foreground><file><path>' +
  path +
  '</path></file><producer>' +
  kind +
  '</producer></foreground></layer_' +
  layer +
  '></stage></channel>';

describe('verified native preset media opacity', () => {
  it('recognizes a Matroska Main10 base track using its actual decoder configuration', () => {
    expect(plainMatroskaVideoOfPrefix(mkv(video()))).toBe(true);
    const avc = Buffer.from([1, 100, 0, 42, 0xff, 0xe1, 0, 2, 0x67, 1, 1, 0, 2, 0x68, 1]);
    expect(plainMatroskaVideoOfPrefix(mkv(track('V_MPEG4/ISO/AVC', avc)))).toBe(true);
  });

  it('retains fallback for explicit alpha, auxiliary configurations, or unknown formats', () => {
    for (const bytes of [
      mkv(track('V_MPEGH/ISO/HEVC', hevc(0, false), { alpha: true })),
      mkv(track('V_MPEGH/ISO/HEVC', hevc(0, false), { additionalData: true })),
      mkv(track('V_MPEGH/ISO/HEVC', hevc(0, true))),
      mkv(track('V_MPEGH/ISO/HEVC', hevc(1, false))),
      mkv(track('V_VP9', Buffer.of(1))),
      mkv(video(), video()),
      mkv(video()).subarray(0, 50),
      Buffer.from('not a media header'),
    ]) {
      expect(plainMatroskaVideoOfPrefix(bytes)).toBe(false);
    }
  });

  it('reads only the exact native NDI foreground and its current frame inside a CUT wrapper', () => {
    const scene = (producer: string, age: number, count: number, name = 'A &amp; B') =>
      '<channel><stage><layer_66><foreground><media><video-frames>' +
      count +
      '</video-frames><video-age-ms>' +
      age +
      '</video-age-ms></media><ndi><name>' +
      name +
      '</name></ndi>' +
      producer +
      '</foreground></layer_66></stage></channel>';
    const cut =
      '<producer>transition</producer><transition><producer>ndi</producer><type>cut</type></transition>';
    for (const root of ['<producer>ndi</producer>', cut]) {
      expect(establishedNdiVideoFrame(scene(root, 499, 2), 66, 'A & B')).toBe(true);
      expect(establishedNdiVideoFrame(scene(root, 500, 2), 66, 'A & B')).toBe(false);
      expect(establishedNdiVideoFrame(scene(root, -1, 2), 66, 'A & B')).toBe(false);
      expect(establishedNdiVideoFrame(scene(root, 0, 0), 66, 'A & B')).toBe(false);
      expect(establishedNdiVideoFrame(scene(root, 20, 1), 66, 'Another')).toBe(false);
      expect(establishedNdiVideoFrame(scene(root, 20, 1), 65, 'A & B')).toBe(false);
    }
    expect(
      establishedNdiVideoFrame(scene(cut.replace('>ndi<', '>ffmpeg<'), 5, 30), 66, 'A & B'),
    ).toBe(false);
    expect(establishedNdiVideoFrame(scene(cut.replace('>cut<', '>mix<'), 5, 30), 66, 'A & B')).toBe(
      false,
    );
  });

  it('requires the exact fingerprinted local-file path of an established foreground', () => {
    expect(establishedFingerprintFile(stage(mkvPath), 61, FINGERPRINT)).toBe(mkvPath);
    expect(
      establishedFingerprintFile(stage(mkvPath, 'transition'), 61, FINGERPRINT),
    ).toBeUndefined();
    expect(establishedFingerprintFile(stage(mkvPath), 62, FINGERPRINT)).toBeUndefined();
    expect(establishedFingerprintFile(stage(mkvPath), 61, 'bf'.repeat(32))).toBeUndefined();
    expect(
      establishedFingerprintFile(stage('https://host/' + FINGERPRINT + '.mkv'), 61, FINGERPRINT),
    ).toBeUndefined();
    expect(
      establishedFingerprintFile(
        stage('\\\\host\\share\\' + FINGERPRINT + '.mkv'),
        61,
        FINGERPRINT,
      ),
    ).toBeUndefined();
  });

  it('recognizes an original named Matroska only at the authorized local catalogue path', () => {
    const original = 'C:/Users/apasai/Desktop/medias/Mountains .mkv';
    expect(
      establishedFingerprintFile(stage(original), 61, FINGERPRINT, original.replaceAll('/', '\\')),
    ).toBe(original);
    expect(establishedFingerprintFile(stage(original), 61, FINGERPRINT)).toBeUndefined();
    expect(
      establishedFingerprintFile(stage(original), 61, FINGERPRINT, 'D:/Archive/Mountains .mkv'),
    ).toBeUndefined();
    expect(
      establishedFingerprintFile(stage(mkvPath), 61, 'cd'.repeat(32), mkvPath),
    ).toBeUndefined();
  });

  it('fails closed when local bytes cannot be read or the proof is cancelled', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'cg-opaque-media-'));
    try {
      const file = join(scratch, FINGERPRINT + '.mkv');
      await writeFile(file, mkv(video()));
      expect(await probeOpaqueMatroska(file, AbortSignal.timeout(500))).toBe(true);
      expect(await probeOpaqueMatroska(file, AbortSignal.abort())).toBe(false);
      expect(await probeOpaqueMatroska(file + '.missing', AbortSignal.timeout(500))).toBe(false);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it('uses only the established programme route and fresh video on its own holder', () => {
    const route =
      '<foreground><producer>route</producer><route><channel>2</channel><layer>5</layer></route></foreground>';
    const current = (frames: number, age: number, kind = 'ffmpeg') =>
      '<foreground><media><video-frames>' +
      frames +
      '</video-frames><video-age-ms>' +
      age +
      '</video-age-ms></media><producer>' +
      kind +
      '</producer></foreground>';
    const stageWithRoute = (holder: string) =>
      '<channel><stage><layer_61>' +
      route +
      '</layer_61><layer_5>' +
      holder +
      '</layer_5></stage></channel>';
    const ready = stageWithRoute(current(142, 40));
    expect(establishedRouteSource(ready, 61)).toEqual({ channel: 2, layer: 5 });
    expect(establishedRouteSource(ready, 5)).toBeUndefined();
    expect(establishedPlaylistVideoFrame(ready, 5)).toBe(true);
    expect(establishedPlaylistVideoFrame(ready, 61)).toBe(false);
    expect(establishedPlaylistVideoFrame(stageWithRoute(current(142, 501)), 5)).toBe(false);
    expect(establishedPlaylistVideoFrame(stageWithRoute(current(0, -1)), 5)).toBe(false);
    expect(establishedPlaylistVideoFrame(stageWithRoute(current(142, 40, 'ndi')), 5)).toBe(false);
  });

  it('retains fallback when actual FILL or CLIP leaves visible edges uncovered', () => {
    const plate = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const raster = { width: 1920, height: 1080 };
    expect(opaqueFitCoversPlate({ fill: plate, clip: plate }, plate, raster)).toBe(true);
    const inset = { ...plate, y: 0.22, height: 0.36 };
    expect(opaqueFitCoversPlate({ fill: inset, clip: plate }, plate, raster)).toBe(false);
    expect(opaqueFitCoversPlate({ fill: plate, clip: inset }, plate, raster)).toBe(false);
  });
});
