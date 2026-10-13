import { describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import { Exporter, SINGLE_FILE_INLINE_WARN_BYTES } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';

/**
 * D-128 Phase 5 — the `.vcg` packs each video element's STORED canonical WebM
 * verbatim as `assets/video/<sha>.webm` + an `assetIndex` entry (kind 'video'),
 * the index.html's `assetUrls` map carries id → packaged relative path (the
 * runtime's widened asset-src walk sets `<video src>` from it — zero external
 * requests), a MISSING video is a preflight ERROR (decision (c) — the image
 * pattern, never the lottie silent skip), and the projected single-file inline
 * size warns past the provisional threshold (decision (d) — actionable, never
 * a block; the `.vcg` itself is unaffected).
 */

const VIDEO_BYTES_A = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]); // EBML magic + junk
const VIDEO_BYTES_B = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 8, 7]);
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const PATH_A = `assets/video/${SHA_A}.webm`;
const PATH_B = `assets/video/${SHA_B}.webm`;

function videoMeta(assetId: string, sha: string, bytes: Uint8Array, byteSize?: number): AssetMeta {
  return {
    assetId,
    kind: 'video',
    filename: `${assetId}.webm`,
    sha256: sha,
    byteSize: byteSize ?? bytes.byteLength,
    workingPath: `projects/p/assets/video/${sha}.webm`,
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

function videoElement(id: string, assetId: string): Record<string, unknown> {
  return {
    id,
    name: id,
    type: 'video',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 480, h: 70 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId,
    durationMs: 14320,
    holdBehavior: 'loop',
  };
}

function baseScene(children: unknown[], compChildren: unknown[] = []): Scene {
  return {
    schemaVersion: 1,
    id: 's-video',
    name: 'LowerThird',
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
    metadata: { createdAt: '2026-07-25T00:00:00.000Z', updatedAt: '2026-07-25T00:00:00.000Z' },
  } as unknown as Scene;
}

describe('Exporter (.vcg) — D-128 Phase 5 video packaging', () => {
  it('packs the stored WebM bytes VERBATIM under assets/video/ and indexes them (kind video)', async () => {
    const assets = stubAssets([videoMeta('vid-a', SHA_A, VIDEO_BYTES_A)], {
      'vid-a': VIDEO_BYTES_A,
    });
    const { vcg } = await makeExporter(assets).produce(baseScene([videoElement('v1', 'vid-a')]));
    const { manifest, files } = await unpack(vcg);

    // Bytes verbatim — the canonical converted form, never re-encoded at export.
    expect(files.get(PATH_A)).toEqual(VIDEO_BYTES_A);
    const entry = manifest.assetIndex.find((e) => e.id === 'vid-a');
    expect(entry?.kind).toBe('video');
    expect(entry?.path).toBe(PATH_A);
    expect(entry?.mime).toBe('video/webm');
    expect(entry?.bytes).toBe(VIDEO_BYTES_A.byteLength);
    expect(entry?.sha256).toBe(SHA_A);
  });

  it('wires the index.html assetUrls map with the PACKAGE-RELATIVE path (no external refs)', async () => {
    const assets = stubAssets([videoMeta('vid-a', SHA_A, VIDEO_BYTES_A)], {
      'vid-a': VIDEO_BYTES_A,
    });
    const { vcg } = await makeExporter(assets).produce(baseScene([videoElement('v1', 'vid-a')]));
    const { files } = await unpack(vcg);
    const indexHtml = new TextDecoder().decode(files.get('index.html'));
    // The id → packaged-path pair rides the SAME assetUrls map images use; the
    // runtime's widened walk sets <video src> from it.
    expect(indexHtml).toContain(`"vid-a":"${PATH_A}"`);
    expect(indexHtml).not.toMatch(/(https?:|file:)/);
  });

  it('MULTI-VIDEO + nested-composition closure: every referenced clip lands in the package once', async () => {
    const assets = stubAssets(
      [videoMeta('vid-a', SHA_A, VIDEO_BYTES_A), videoMeta('vid-b', SHA_B, VIDEO_BYTES_B)],
      { 'vid-a': VIDEO_BYTES_A, 'vid-b': VIDEO_BYTES_B },
    );
    // vid-a on the main scene TWICE (dedupe) + vid-b inside a composition (the
    // closure a sequence-referenced comp relies on — all compositions are walked).
    const scene = baseScene(
      [videoElement('v1', 'vid-a'), videoElement('v2', 'vid-a')],
      [videoElement('v3', 'vid-b')],
    );
    const { vcg } = await makeExporter(assets).produce(scene);
    const { manifest, files } = await unpack(vcg);

    expect(files.get(PATH_A)).toEqual(VIDEO_BYTES_A);
    expect(files.get(PATH_B)).toEqual(VIDEO_BYTES_B);
    const videoEntries = manifest.assetIndex.filter((e) => e.kind === 'video');
    expect(videoEntries.map((e) => e.id).sort()).toEqual(['vid-a', 'vid-b']);
  });

  it('a MISSING video asset is a preflight ERROR (the image pattern) and produce() blocks', async () => {
    const assets = stubAssets([], {});
    const exporter = makeExporter(assets);
    const scene = baseScene([videoElement('v1', 'vid-gone')]);

    const issues = await exporter.preflight(scene);
    const missing = issues.find((i) => i.code === 'missing-asset');
    expect(missing?.severity).toBe('error');
    expect(missing?.message).toContain('Video element');
    expect(missing?.elementId).toBe('v1');

    await expect(exporter.produce(scene)).rejects.toThrow(/missing-asset/);
  });

  it('SIZE preflight: warns with the total + dominant assets above the threshold, quiet below, and never blocks', async () => {
    // Three "clips" whose metadata claims sizes that push the projected inline
    // payload (×4/3) past the threshold; bytes stay tiny so the test is cheap.
    const third = Math.ceil((SINGLE_FILE_INLINE_WARN_BYTES * 3) / 4 / 2); // 2 of these ≈ at threshold
    const metas = [
      videoMeta('vid-a', SHA_A, VIDEO_BYTES_A, third + 1024 * 1024),
      videoMeta('vid-b', SHA_B, VIDEO_BYTES_B, third + 2 * 1024 * 1024),
    ];
    const assets = stubAssets(metas, { 'vid-a': VIDEO_BYTES_A, 'vid-b': VIDEO_BYTES_B });
    const scene = baseScene([videoElement('v1', 'vid-a'), videoElement('v2', 'vid-b')]);

    const issues = await makeExporter(assets).preflight(scene);
    const size = issues.find((i) => i.code === 'single-file-size');
    expect(size?.severity).toBe('warning'); // decision (d): a warning, never a block
    // Actionable: the projected total, the dominating clips BY NAME, and the
    // ".vcg has no such limit" alternative.
    expect(size?.message).toMatch(/inline ~\d+(\.\d+)? MB/);
    expect(size?.message).toContain('vid-b.webm');
    expect(size?.message).toContain('.vcg package has no such limit');
    // A warning must not block the export.
    const { vcg } = await makeExporter(assets).produce(scene);
    expect(vcg.byteLength).toBeGreaterThan(0);
  });

  it('SIZE preflight stays QUIET for the owner-realistic three-heavy-clip template (~33.5 MB inline)', async () => {
    const heavy = Math.round(8.7 * 1024 * 1024);
    const metas = ['x', 'y', 'z'].map((s, i) =>
      videoMeta(`vid-${s}`, String(i).repeat(64), VIDEO_BYTES_A, heavy),
    );
    const assets = stubAssets(metas, {
      'vid-x': VIDEO_BYTES_A,
      'vid-y': VIDEO_BYTES_A,
      'vid-z': VIDEO_BYTES_A,
    });
    const scene = baseScene([
      videoElement('v1', 'vid-x'),
      videoElement('v2', 'vid-y'),
      videoElement('v3', 'vid-z'),
    ]);
    const issues = await makeExporter(assets).preflight(scene);
    expect(issues.find((i) => i.code === 'single-file-size')).toBeUndefined();
  });
});
