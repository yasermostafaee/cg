import { describe, it, expect } from 'vitest';
import {
  AssetMetaSchema,
  ProjectAssetEntrySchema,
  ProjectPackageManifestSchema,
  PROJECT_PACKAGE_EXT,
} from '../src/index.js';

/**
 * D-150 / B-104 — the project package manifest.
 *
 * The point of these tests is less the shape than the DERIVATION: the package's asset
 * entry is `AssetMetaSchema` with one field swapped, so a second description of an
 * asset cannot come into existence and drift from the first.
 */

const base = {
  assetId: 'a-1',
  kind: 'image' as const,
  filename: 'logo.png',
  sha256: 'a'.repeat(64),
  byteSize: 12,
};

describe('ProjectAssetEntrySchema — derived, not re-declared', () => {
  it('requires the package-internal path', () => {
    expect(ProjectAssetEntrySchema.safeParse(base).success).toBe(false);
    expect(ProjectAssetEntrySchema.parse({ ...base, path: 'assets/image/x.png' }).path).toBe(
      'assets/image/x.png',
    );
  });

  it('drops workingPath — the workspace-relative path is exactly what must not travel', () => {
    // `workingPath` is `projects/<projectId>/assets/...`: it encodes a dependency on a
    // storage root that can change between sessions, which is the mechanism of B-104.
    const parsed = ProjectAssetEntrySchema.parse({
      ...base,
      path: 'assets/image/x.png',
      workingPath: 'projects/p1/assets/image/x.png',
    });
    expect('workingPath' in parsed).toBe(false);
  });

  it('keeps every other fact the asset metadata carries', () => {
    const meta = AssetMetaSchema.parse({ ...base, workingPath: 'projects/p1/a.png' });
    const entry = ProjectAssetEntrySchema.parse({ ...base, path: 'assets/image/x.png' });
    for (const key of Object.keys(meta)) {
      if (key === 'workingPath') continue;
      expect(entry, `entry is missing ${key}`).toHaveProperty(key);
    }
  });

  it('round-trips optional video lineage', () => {
    const provenance = {
      sourceFilename: 'a.mov',
      sourceFps: 25,
      targetFps: 50,
      sourceWidth: 1920,
      sourceHeight: 1080,
    };
    const entry = ProjectAssetEntrySchema.parse({
      ...base,
      kind: 'video',
      path: 'assets/video/x.webm',
      provenance,
    });
    expect(entry.provenance).toEqual(provenance);
  });
});

describe('ProjectPackageManifestSchema', () => {
  const manifest = {
    format: 'cgproj' as const,
    formatVersion: '1.0' as const,
    projectId: 'p-1',
    name: 'Demo',
    savedAt: '2026-08-11T12:00:00.000Z',
    assets: [{ ...base, path: 'assets/image/x.png' }],
  };

  it('round-trips', () => {
    expect(ProjectPackageManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('refuses the .vcg format by NAME, so an export cannot pass as a project', () => {
    // This literal is what lets `readProjectDocument` tell an operator they picked an
    // exported template instead of failing somewhere deeper and less legible.
    expect(ProjectPackageManifestSchema.safeParse({ ...manifest, format: 'vcg' }).success).toBe(
      false,
    );
  });

  it('names the extension once, for every writer to share', () => {
    expect(PROJECT_PACKAGE_EXT).toBe('.cgproj');
  });
});
