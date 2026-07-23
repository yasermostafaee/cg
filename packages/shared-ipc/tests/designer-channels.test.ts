import { describe, expect, it } from 'vitest';
import {
  AssetMetaSchema,
  AssetsImportChannel,
  AssetsImportedChannel,
  AssetsListChannel,
  AssetsRemoveChannel,
  AssetsStoreBytesChannel,
  ExportPreflightChannel,
  ExportProgressChannel,
  ExportRunChannel,
  PreviewLoadChannel,
  PreviewReadyChannel,
  PreviewReloadChannel,
  PreviewUpdateChannel,
  ProjectsActiveChangedChannel,
  ProjectsNewChannel,
  ProjectsOpenChannel,
  ProjectsRecentChannel,
  ProjectsSaveChannel,
} from '../src/index.js';

/**
 * Schema sanity checks for the M6.0 Designer channels. Wire integration
 * gets exercised by `apps/designer`'s tests once M6.1 lands.
 */

const sha = 'a'.repeat(64);
const sampleScene = {
  schemaVersion: 1 as const,
  id: 'scene-1',
  name: 'demo',
  templateType: 'lower-third' as const,
  resolution: { width: 1920, height: 1080 },
  frameRate: 50 as const,
  safeAreas: { title: 5, action: 10 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent' as const,
  layers: [],
  fields: [],
  bindings: [],
  fonts: [],
  metadata: {
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  },
};

describe('projects.* channel schemas', () => {
  it('projects.new accepts name + templateType', () => {
    expect(
      ProjectsNewChannel.request.parse({ name: 'My LT', templateType: 'lower-third' }),
    ).toBeTruthy();
  });

  it('projects.open allows omitting path (file-dialog path)', () => {
    expect(ProjectsOpenChannel.request.parse({})).toBeTruthy();
    expect(ProjectsOpenChannel.request.parse({ path: 'C:/x.json' })).toBeTruthy();
  });

  it('projects.save requires a scene; path optional for save-as', () => {
    expect(ProjectsSaveChannel.request.parse({ scene: sampleScene })).toBeTruthy();
  });

  it('projects.recent has a void request', () => {
    expect(ProjectsRecentChannel.request.parse(undefined)).toBeUndefined();
    expect(ProjectsRecentChannel.response.parse([])).toEqual([]);
  });

  it('projects.recent accepts both handle-keyed (D-088) and legacy path entries', () => {
    const handleEntry = {
      name: 'Demo',
      projectId: 'p1',
      handleKey: 'p1',
      lastSavedAt: '2026-06-19T12:00:00.000Z',
    };
    const legacyEntry = {
      name: 'Old',
      path: 'projects/old.cg.json',
      templateType: 'lower-third',
      lastOpenedAt: '2026-06-18T09:00:00.000Z',
    };
    expect(ProjectsRecentChannel.response.parse([handleEntry, legacyEntry])).toHaveLength(2);
  });

  it('projects.active-changed accepts a null scene (no active project)', () => {
    expect(ProjectsActiveChangedChannel.payload.parse({ scene: null, path: null })).toBeTruthy();
  });
});

describe('assets.* channel schemas', () => {
  const sampleAsset = {
    assetId: 'a1',
    kind: 'image' as const,
    filename: 'bg.png',
    sha256: sha,
    byteSize: 1024,
    workingPath: '/wd/bg.png',
  };

  it('assets.import requires a sourcePath', () => {
    expect(AssetsImportChannel.request.parse({ sourcePath: 'C:/in.png' })).toBeTruthy();
  });

  it('assets.list returns an array', () => {
    expect(AssetsListChannel.response.parse([])).toEqual([]);
  });

  it('assets.remove just needs an assetId', () => {
    expect(AssetsRemoveChannel.request.parse({ assetId: 'a1' })).toBeTruthy();
  });

  it('assets.imported publish payload validates a full meta', () => {
    expect(AssetsImportedChannel.payload.parse(sampleAsset)).toMatchObject({ kind: 'image' });
  });

  it('assets meta rejects non-sha256 hashes', () => {
    expect(() =>
      AssetsImportedChannel.payload.parse({ ...sampleAsset, sha256: 'not-a-hash' }),
    ).toThrow();
  });

  it('D-128 — an asset WITHOUT provenance still parses (back-compat with every stored asset)', () => {
    const parsed = AssetMetaSchema.parse(sampleAsset);
    expect(parsed.provenance).toBeUndefined();
  });

  it('D-128 — a video asset with full provenance parses and round-trips', () => {
    const video = {
      ...sampleAsset,
      kind: 'video' as const,
      filename: 'archive-clip.webm',
      workingPath: 'projects/p1/assets/video/abc.webm',
      provenance: {
        sourceFilename: 'archive-clip.avi',
        sourceFps: 29.97,
        targetFps: 50,
        sourceWidth: 1920,
        sourceHeight: 1080,
        crop: { x: 100, y: 50, width: 640, height: 480 },
      },
    };
    expect(AssetMetaSchema.parse(video)).toEqual(video);
    // crop is optional — a full-frame conversion carries provenance without it
    const noCrop = { ...video, provenance: { ...video.provenance, crop: undefined } };
    expect(AssetMetaSchema.parse(noCrop).provenance?.crop).toBeUndefined();
  });

  it('D-128 — assets.storeBytes takes raw bytes + filename + kind (+ provenance)', () => {
    const req = AssetsStoreBytesChannel.request.parse({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'clip.webm',
      kind: 'video' as const,
    });
    expect(req.bytes).toBeInstanceOf(Uint8Array);
    expect(AssetsStoreBytesChannel.response.parse({ asset: sampleAsset })).toBeTruthy();
  });
});

describe('export.* channel schemas', () => {
  it('export.preflight accepts a scene and returns an issues array', () => {
    expect(ExportPreflightChannel.request.parse({ scene: sampleScene })).toBeTruthy();
    expect(ExportPreflightChannel.response.parse({ issues: [] })).toEqual({ issues: [] });
  });

  it('export.run accepts an optional sign toggle', () => {
    expect(
      ExportRunChannel.request.parse({ scene: sampleScene, outputPath: 'C:/o.vcg' }),
    ).toBeTruthy();
    expect(
      ExportRunChannel.request.parse({ scene: sampleScene, outputPath: 'C:/o.vcg', sign: true }),
    ).toBeTruthy();
  });

  it('export.progress validates monotonic 0..1 progress', () => {
    expect(ExportProgressChannel.payload.parse({ step: 'pack', progress: 0.4 })).toMatchObject({
      step: 'pack',
    });
    expect(() => ExportProgressChannel.payload.parse({ step: 'pack', progress: 1.5 })).toThrow();
  });
});

describe('preview.* channel schemas', () => {
  it('preview.load accepts a scene and returns a cgpreview:// URL', () => {
    expect(PreviewLoadChannel.request.parse({ scene: sampleScene })).toBeTruthy();
    expect(
      PreviewLoadChannel.response.parse({
        src: 'cgpreview://scene-1/index.html',
        html: '<!doctype html><div class="cg-stage"></div>',
      }),
    ).toBeTruthy();
  });

  it('preview.update accepts a fields map', () => {
    expect(PreviewUpdateChannel.request.parse({ fields: { title: 'hi' } })).toBeTruthy();
  });

  it('preview.reload has a void request', () => {
    expect(PreviewReloadChannel.request.parse(undefined)).toBeUndefined();
  });

  it('preview.ready publish payload carries an ISO timestamp', () => {
    expect(PreviewReadyChannel.payload.parse({ at: '2026-05-23T00:00:00.000Z' })).toBeTruthy();
  });
});
