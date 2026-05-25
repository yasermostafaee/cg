import type { AssetEntry, FontReference, Manifest, Scene } from '@cg/shared-schema';

/**
 * Minimal Scene used by pack/unpack/roundtrip tests. Persian lower-third
 * shape — exercises the bits that matter (TextElement, FontReference, RTL
 * direction) without dragging in assets or recursion.
 */
export const fixtureScene: Scene = {
  schemaVersion: 1,
  id: 'scene-fixture-1',
  name: 'persian-lower-third',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent',
  layers: [
    {
      id: 'layer-1',
      name: 'Text',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        {
          id: 'el-name',
          name: 'anchor',
          type: 'text',
          transform: {
            position: { x: 100, y: 800 },
            size: { w: 800, h: 80 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0, y: 0 },
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 0,
          text: '{{anchor}}',
          font: {
            family: 'Vazirmatn',
            weight: 700,
            style: 'normal',
            size: 48,
            lineHeight: 1.4,
            letterSpacing: 0,
          },
          color: '#FFFFFF',
          align: 'start',
          direction: 'rtl',
          fitMode: 'autosize',
          overflow: 'ellipsis',
        },
      ],
    },
  ],
  fields: [
    {
      id: 'anchor',
      label: 'Anchor name',
      required: true,
      type: 'text',
      default: 'سارا نادری',
      direction: 'rtl',
    },
  ],
  bindings: [
    {
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'el-name', placeholder: '{{anchor}}' },
    },
  ],
  fonts: [
    {
      family: 'Vazirmatn',
      weights: [400, 500, 700],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'fonts/Vazirmatn-Variable.woff2',
    },
  ],
  metadata: {
    createdAt: '2026-05-19T18:00:00.000Z',
    updatedAt: '2026-05-19T18:00:00.000Z',
  },
};

export const fixtureFontDeps: readonly FontReference[] = fixtureScene.fonts;

export const fixtureAssetIndex: readonly AssetEntry[] = [];

export const fixtureManifestExtras = {
  id: 'tpl-fixture-1',
  name: 'persian-lower-third',
  authoring: {
    designerVersion: '0.0.0',
    createdAt: '2026-05-19T18:00:00.000Z',
    exportedAt: '2026-05-19T18:01:00.000Z',
  },
  compatibility: {
    minRuntimeVersion: '0.0.0',
    minCasparCGVersion: '2.3.0',
  },
  fontDeps: fixtureFontDeps,
  assetIndex: fixtureAssetIndex,
} as const satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
  fontDeps: readonly FontReference[];
  assetIndex: readonly AssetEntry[];
};

export const fixtureIndexHtml = '<!doctype html><html><body>placeholder</body></html>';
export const fixtureCgJs = '/* placeholder template runtime */';
export const fixtureCgCss = '/* placeholder template styles */';
