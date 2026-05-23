import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '../src/manifest.js';

const sha = 'a'.repeat(64);

const minimalManifest = {
  schemaVersion: 1 as const,
  format: 'vcg' as const,
  formatVersion: '1.0' as const,
  id: 'tpl-1',
  name: 'lower-third-persian',
  templateType: 'lower-third' as const,
  resolution: { width: 1920, height: 1080 },
  frameRate: 50 as const,
  fields: [{ id: 'headline', type: 'text' as const, required: true }],
  fontDeps: [
    {
      family: 'Vazirmatn',
      weights: [400, 700],
      styles: ['normal' as const],
      source: 'bundled' as const,
    },
  ],
  assetIndex: [
    {
      id: 'asset-1',
      path: 'assets/img/logo.png',
      kind: 'image' as const,
      bytes: 12345,
      sha256: sha,
      mime: 'image/png',
    },
  ],
  integrity: {
    files: [{ path: 'template.json', sha256: sha, bytes: 1024 }],
    root: sha,
  },
  authoring: {
    designerVersion: '0.0.0',
    createdAt: '2026-05-19T18:00:00.000Z',
    exportedAt: '2026-05-19T18:01:00.000Z',
  },
  compatibility: {
    minRuntimeVersion: '0.0.0',
    minCasparCGVersion: '2.3.0',
  },
};

describe('Manifest', () => {
  it('accepts a minimal manifest', () => {
    expect(ManifestSchema.parse(minimalManifest).id).toBe('tpl-1');
  });

  it('accepts an optional signing block', () => {
    const m = {
      ...minimalManifest,
      signing: {
        algorithm: 'ed25519' as const,
        publicKeyId: 'key-1',
        signature: 'base64==',
      },
    };
    expect(ManifestSchema.parse(m).signing?.publicKeyId).toBe('key-1');
  });

  it('rejects non-sha256 integrity root', () => {
    expect(() =>
      ManifestSchema.parse({
        ...minimalManifest,
        integrity: { ...minimalManifest.integrity, root: 'short' },
      }),
    ).toThrow();
  });

  it('rejects unknown format', () => {
    expect(() => ManifestSchema.parse({ ...minimalManifest, format: 'zip' })).toThrow();
  });
});
