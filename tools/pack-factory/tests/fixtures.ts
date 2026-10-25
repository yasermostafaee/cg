import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SceneSchema, type ProjectAssetEntry, type Scene } from '@cg/shared-schema';
import { packProject, sha256Hex } from '@cg/vcg-format';

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const MASTER_LOGO = 'master-logo';
const SIBLING_LOGO = 'sibling-logo';
const MASTER_FONT = 'master-font';
const MASTER_DECOR = 'master-decor';

export interface FactoryFixture {
  root: string;
  brandKitPath: string;
  recipePath: string;
  outputPath: string;
  cleanup: () => Promise<void>;
}

export async function createFactoryFixture(brandId = 'example-station'): Promise<FactoryFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-pack-factory-'));
  const masterLogo = bytes(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#123456"/></svg>',
  );
  const siblingLogo = bytes(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
  );
  const masterFont = bytes('synthetic-woff2-fixture');
  const masterDecor = bytes(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 0h20v20z" fill="#FFFFFF"/></svg>',
  );
  const masterEntry = entry(MASTER_LOGO, 'master.svg', masterLogo, 'image');
  const siblingEntry = entry(SIBLING_LOGO, 'sibling.svg', siblingLogo, 'image');
  const fontEntry = entry(MASTER_FONT, 'master.woff2', masterFont, 'font');
  const decorEntry = entry(MASTER_DECOR, 'decor.svg', masterDecor, 'image');
  const masterPath = path.join(root, 'master.cgproj');
  await fs.writeFile(
    masterPath,
    await packProject({
      scene: masterScene(),
      index: [masterEntry, siblingEntry, fontEntry, decorEntry],
      files: new Map([
        [masterEntry.path, masterLogo],
        [siblingEntry.path, siblingLogo],
        [fontEntry.path, masterFont],
        [decorEntry.path, masterDecor],
      ]),
      savedAt: CREATED_AT,
    }),
  );

  await fs.writeFile(
    path.join(root, 'customer-logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><circle cx="50" cy="50" r="45" fill="#654321"/></svg>',
  );
  await fs.writeFile(path.join(root, 'customer-font.woff2'), 'synthetic-customer-font');
  const brandKitPath = path.join(root, 'brandkit.json');
  await fs.writeFile(
    brandKitPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        id: brandId,
        name: 'Synthetic Station',
        motion: 'news',
        targets: [{ key: 'hd', width: 1920, height: 1080 }],
        colors: { primary: { value: '#654321', source: 'brand' } },
        fonts: {
          display: {
            path: './customer-font.woff2',
            family: 'Synthetic Display',
            weight: 700,
            style: 'normal',
            licenseConfirmed: true,
            licenseNote: 'Synthetic test licence',
          },
        },
        assets: {
          logo: {
            kind: 'image',
            sourcePath: './customer-logo.svg',
            renderPath: './customer-logo.svg',
          },
        },
        brandbookNotes: ['Synthetic fixture only'],
        references: [],
      },
      null,
      2,
    ),
  );
  const recipePath = path.join(root, 'pack.json');
  await fs.writeFile(
    recipePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        family: 'Synthetic essentials',
        templates: [
          {
            key: 'lower-third',
            sourceProject: './master.cgproj',
            compositionId: 'comp-main',
            target: 'hd',
            displayName: 'Synthetic Lower Third',
            colors: { '#123456': 'primary' },
            assets: { [MASTER_LOGO]: 'logo' },
            fonts: { [MASTER_FONT]: 'display' },
            preview: { data: {}, introMs: 20, holdMs: 60, outMs: 20 },
          },
        ],
      },
      null,
      2,
    ),
  );
  return {
    root,
    brandKitPath,
    recipePath,
    outputPath: path.join(root, 'delivery'),
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

function masterScene(): Scene {
  const base = {
    schemaVersion: 1 as const,
    id: 'master-project',
    name: 'Master',
    templateType: 'lower-third' as const,
    resolution: { width: 1920, height: 1080 },
    frameRate: 50 as const,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent' as const,
    layers: [],
    entryCompositionId: 'comp-main',
    compositions: [
      {
        id: 'comp-main',
        name: 'Main',
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out: 100 },
        activeRange: { in: 0, out: 100 },
        editorBackdrop: 'transparent' as const,
        layers: [
          {
            id: 'layer-main',
            name: 'Main',
            visible: true,
            locked: false,
            blendMode: 'normal' as const,
            children: [shape(), image('logo', MASTER_LOGO), image('decor', MASTER_DECOR)],
          },
        ],
        fields: [],
        bindings: [],
      },
      {
        id: 'comp-sibling',
        name: 'Sibling',
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out: 100 },
        editorBackdrop: 'transparent' as const,
        layers: [
          {
            id: 'layer-sibling',
            name: 'Sibling',
            visible: true,
            locked: false,
            blendMode: 'normal' as const,
            children: [image('sibling', SIBLING_LOGO)],
          },
        ],
        fields: [],
        bindings: [],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [
      {
        family: `asset-${MASTER_FONT}`,
        weights: [700],
        styles: ['normal' as const],
        source: 'bundled' as const,
        bundledPath: 'master.woff2',
      },
    ],
    metadata: { createdAt: CREATED_AT, updatedAt: CREATED_AT },
  };
  return SceneSchema.parse(base);
}

function elementBase(id: string): Record<string, unknown> {
  return {
    id,
    name: id,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 400, h: 200 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
}

function shape(): Record<string, unknown> {
  return {
    ...elementBase('plate'),
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#123456' },
  };
}

function image(id: string, assetId: string): Record<string, unknown> {
  return {
    ...elementBase(id),
    type: 'image',
    assetId,
    source: 'project',
    fit: 'contain',
    preserveAspect: true,
  };
}

function entry(
  assetId: string,
  filename: string,
  content: Uint8Array,
  kind: 'image' | 'font',
): ProjectAssetEntry {
  const sha256 = sha256Hex(content);
  return {
    assetId,
    kind,
    filename,
    sha256,
    byteSize: content.byteLength,
    path:
      kind === 'font'
        ? `assets/font/${sha256}.woff2`
        : `assets/image/${sha256}${path.extname(filename)}`,
  };
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
