import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';
import { ExporterSingleFile } from '../src/exporter-single-file.js';
import { collectAudioElements, audioMimeOf } from '../src/audio-export.js';
import type { ImageAssetSource } from '../src/image-export.js';

/**
 * `D-165` — the single-file HTML (what CG Control serves CasparCG) inlines each sound's stored WAV
 * as a `data:audio/wav` URI in the `assetUrls` map — zero external references, admitted by the
 * artifact's own `media-src data:` — and a sound whose bytes are gone is a warning, never a throw.
 */

const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 7]);
const source = {
  get: async (id: string): Promise<AssetMeta | null> =>
    id.startsWith('snd-')
      ? ({
          assetId: id,
          filename: `${id}.wav`,
          kind: 'audio',
          sha256: 'e'.repeat(64),
          byteSize: wavBytes.byteLength,
        } as unknown as AssetMeta)
      : null,
  bytes: async (id: string) => (id.startsWith('snd-') ? wavBytes : null),
} as unknown as ImageAssetSource;

function exporter(): ExporterSingleFile {
  return new ExporterSingleFile({
    cgJsIife:
      'var CG = { createRuntime: function () { return { ready: Promise.resolve() }; }, installCasparGlobals: function () {}, applyOutputPosition: function () {} };',
    cgCss: 'html,body{background:transparent}',
    fontsCss: '',
    assets: source,
  });
}

function audioEl(id: string, assetId: string): Record<string, unknown> {
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
    start: { at: 'entrance' },
    volumeDb: 0,
  };
}

function scene(...assetIds: string[]): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    name: 'Sting',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'sounds',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: assetIds.map((a, i) => audioEl(`a${String(i)}`, a)),
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
  } as unknown as Scene;
}

const expectedDataUri = `data:audio/wav;base64,${btoa(String.fromCharCode(...wavBytes))}`;

describe('ExporterSingleFile — D-165 sound inlining', () => {
  it('🔴 inlines the stored WAV as a data:audio/wav URI — zero external refs', async () => {
    const { html, issues } = await exporter().produce(scene('snd-1'));
    expect(html).toContain(`"snd-1":"${expectedDataUri}"`);
    expect(issues.filter((i) => i.code === 'missing-asset')).toEqual([]);
    expect(html).not.toMatch(/src="https?:/);
    const csp = /Content-Security-Policy"\s*content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp).toContain('media-src data:');
  });

  it('a sound used twice inlines once', async () => {
    const { html } = await exporter().produce(scene('snd-1', 'snd-1'));
    expect(html.split(expectedDataUri).length - 1).toBe(1);
  });

  it('a sound whose bytes are gone is a WARNING naming the element, never a throw', async () => {
    const { issues } = await exporter().produce(scene('gone-1'));
    const w = issues.find((i) => i.code === 'missing-asset');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toContain('Audio element "a0"');
  });

  it('collects every sound once, and its MIME is always WAV', () => {
    expect(collectAudioElements(scene('snd-1', 'snd-2')).map((r) => r.assetId)).toEqual([
      'snd-1',
      'snd-2',
    ]);
    expect(audioMimeOf('anything.mp3')).toBe('audio/wav');
  });
});
