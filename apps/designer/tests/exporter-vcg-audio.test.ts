import { describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import { Exporter } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';

/**
 * `D-165` — the `.vcg` packs each sound's STORED WAV verbatim as `assets/audio/<sha>.wav` + an
 * `assetIndex` entry (kind `audio`, `audio/wav`); the index.html's `assetUrls` map carries
 * id → packaged path (the runtime's asset-src walk sets `<audio src>`); every composition is
 * walked; and a MISSING sound is a preflight ERROR, as a missing video is.
 */

// "RIFF....WAVE" + junk — the bytes are packed verbatim, never decoded at export.
const WAV_A = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 1, 2]);
const WAV_B = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 9]);
const SHA_A = 'c'.repeat(64);
const SHA_B = 'd'.repeat(64);
const PATH_A = `assets/audio/${SHA_A}.wav`;
const PATH_B = `assets/audio/${SHA_B}.wav`;

function audioMeta(assetId: string, sha: string, bytes: Uint8Array): AssetMeta {
  return {
    assetId,
    kind: 'audio',
    filename: `${assetId}.wav`,
    sha256: sha,
    byteSize: bytes.byteLength,
    workingPath: `projects/p/assets/audio/${sha}.wav`,
    audio: {
      sourceFilename: `${assetId}.mp3`,
      durationMs: 900,
      peakDbfs: -3,
      sampleRate: 48000,
      channels: 2,
    },
  };
}

function stubAssets(metas: AssetMeta[], bytesById: Record<string, Uint8Array>): AssetStore {
  return {
    list: async () => metas,
    get: async (id: string) => metas.find((m) => m.assetId === id) ?? null,
    bytes: async (id: string) => bytesById[id] ?? null,
  } as unknown as AssetStore;
}

function makeExporter(assets: AssetStore): Exporter {
  return new Exporter({
    assets,
    cgJs: 'export const createRuntime = () => ({ ready: Promise.resolve() }); export const installCasparGlobals = () => {};',
    cgCss: 'html{background:transparent}',
  });
}

function audioElement(id: string, assetId: string): Record<string, unknown> {
  return {
    id,
    name: id,
    type: 'audio',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 0, h: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId,
    durationMs: 900,
    start: { at: 'exit' },
    volumeDb: -6,
  };
}

function baseScene(children: unknown[], compChildren: unknown[] = []): Scene {
  return {
    schemaVersion: 1,
    id: 's-audio',
    name: 'Sting',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    compositions:
      compChildren.length > 0
        ? [
            {
              id: 'comp1',
              name: 'nested',
              resolution: { width: 1920, height: 1080 },
              frameRange: { in: 0, out: 50 },
              editorBackdrop: 'transparent',
              layers: [
                {
                  id: 'CL1',
                  name: 'comp-main',
                  visible: true,
                  locked: false,
                  blendMode: 'normal',
                  children: compChildren,
                },
              ],
            },
          ]
        : [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
  } as unknown as Scene;
}

describe('Exporter (.vcg) — D-165 sound packaging', () => {
  it('🔴 packs the stored WAV VERBATIM under assets/audio/ and indexes it (kind audio)', async () => {
    const assets = stubAssets([audioMeta('snd-a', SHA_A, WAV_A)], { 'snd-a': WAV_A });
    const { vcg } = await makeExporter(assets).produce(baseScene([audioElement('a1', 'snd-a')]));
    const { manifest, files, scene } = await unpack(vcg);
    expect(files.get(PATH_A)).toEqual(WAV_A);
    const entry = manifest.assetIndex.find((e) => e.id === 'snd-a');
    expect(entry).toMatchObject({
      kind: 'audio',
      path: PATH_A,
      mime: 'audio/wav',
      bytes: WAV_A.byteLength,
      sha256: SHA_A,
    });
    // The element itself round-trips through the package.
    const el = scene.layers[0]?.children[0];
    expect(el).toMatchObject({ type: 'audio', start: { at: 'exit' }, volumeDb: -6 });
  });

  it('wires the index.html assetUrls map with the PACKAGE-RELATIVE path', async () => {
    const assets = stubAssets([audioMeta('snd-a', SHA_A, WAV_A)], { 'snd-a': WAV_A });
    const { vcg } = await makeExporter(assets).produce(baseScene([audioElement('a1', 'snd-a')]));
    const { files } = await unpack(vcg);
    const indexHtml = new TextDecoder().decode(files.get('index.html'));
    expect(indexHtml).toContain(`"snd-a":"${PATH_A}"`);
    expect(indexHtml).not.toMatch(/(https?:|file:)/);
  });

  it('every composition is walked, and a sound used twice is packed once', async () => {
    const assets = stubAssets(
      [audioMeta('snd-a', SHA_A, WAV_A), audioMeta('snd-b', SHA_B, WAV_B)],
      { 'snd-a': WAV_A, 'snd-b': WAV_B },
    );
    const scene = baseScene(
      [audioElement('a1', 'snd-a'), audioElement('a2', 'snd-a')],
      [audioElement('a3', 'snd-b')],
    );
    const { vcg } = await makeExporter(assets).produce(scene);
    const { manifest, files } = await unpack(vcg);
    expect(files.get(PATH_A)).toEqual(WAV_A);
    expect(files.get(PATH_B)).toEqual(WAV_B);
    const entries = manifest.assetIndex.filter((e) => e.kind === 'audio');
    expect(entries.map((e) => e.id).sort()).toEqual(['snd-a', 'snd-b']);
  });

  it('🔴 a MISSING sound is a preflight ERROR and produce() blocks', async () => {
    const exporter = makeExporter(stubAssets([], {}));
    const scene = baseScene([audioElement('a1', 'snd-gone')]);
    const issues = await exporter.preflight(scene);
    const missing = issues.find((i) => i.code === 'missing-asset');
    expect(missing?.severity).toBe('error');
    expect(missing?.message).toContain('Audio element');
    expect(missing?.elementId).toBe('a1');
    await expect(exporter.produce(scene)).rejects.toThrow(/missing-asset/);
  });
});
