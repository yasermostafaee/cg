import { describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import { Exporter } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';

/**
 * D-125 — the `.vcg` packs each Lottie element's JSON as `assets/lottie/<sha>.json`
 * bytes + an `assetIndex` entry (kind 'lottie'), and — §D5(c) — packages the minified
 * player as `cg-lottie.js` and wires the index.html to import it + resolve the JSON
 * into `lottieAssets` (a same-origin fetch under the .vcg's strict 'self' CSP). A
 * scene with NO Lottie is unchanged (no player, no lottie import).
 */

const ANIMATION = { v: '5.7', fr: 30, ip: 0, op: 60, w: 480, h: 270, layers: [], markers: [] };
const LOTTIE_BYTES = new TextEncoder().encode(JSON.stringify(ANIMATION));
const LOTTIE_SHA = 'c'.repeat(64);
const LOTTIE_ASSET_ID = 'furniture-1';
const LOTTIE_PATH = `assets/lottie/${LOTTIE_SHA}.json`;

const lottieMeta: AssetMeta = {
  assetId: LOTTIE_ASSET_ID,
  kind: 'lottie',
  filename: 'furniture.json',
  sha256: LOTTIE_SHA,
  byteSize: LOTTIE_BYTES.byteLength,
  workingPath: `projects/p/assets/lottie/${LOTTIE_SHA}.json`,
};

function stubAssets(): AssetStore {
  return {
    list: async () => [lottieMeta],
    get: async (id: string) => (id === LOTTIE_ASSET_ID ? lottieMeta : null),
    bytes: async (id: string) => (id === LOTTIE_ASSET_ID ? LOTTIE_BYTES : null),
  } as unknown as AssetStore;
}

const PLAYER = 'globalThis.__cgLottie = { loadAnimation: function () {} };';

function makeExporter(withPlayer = true): Exporter {
  return new Exporter({
    assets: stubAssets(),
    cgJs: 'export const createRuntime = () => ({ ready: Promise.resolve() }); export const installCasparGlobals = () => {};',
    ...(withPlayer ? { cgJsLottie: PLAYER } : {}),
    cgCss: 'html{background:transparent}',
  });
}

function baseScene(children: unknown[]): Scene {
  return {
    schemaVersion: 1,
    id: 's-lottie',
    name: 'Furniture',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    background: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' },
  } as unknown as Scene;
}

const lottieElement = {
  id: 'lot-1',
  name: 'lower-third',
  type: 'lottie',
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 480, h: 270 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  assetId: LOTTIE_ASSET_ID,
  speed: 1,
  loopMode: 'none',
  holdBehavior: 'freeze',
  phases: { introEnd: 20, outroStart: 50, source: 'markers' },
};

describe('Exporter (.vcg) — D-125 Lottie packaging', () => {
  it('packs the Lottie JSON bytes under assets/lottie/ and indexes them by assetId (kind lottie)', async () => {
    const { vcg } = await makeExporter().produce(baseScene([lottieElement]));
    const { manifest, files } = await unpack(vcg);

    expect(files.get(LOTTIE_PATH)).toEqual(LOTTIE_BYTES);
    const entry = manifest.assetIndex.find((e) => e.id === LOTTIE_ASSET_ID);
    expect(entry?.kind).toBe('lottie');
    expect(entry?.path).toBe(LOTTIE_PATH);
    expect(entry?.mime).toBe('application/json');
  });

  it('packages the player as cg-lottie.js and wires the index.html to import + resolve it', async () => {
    const { vcg } = await makeExporter().produce(baseScene([lottieElement]));
    const { files } = await unpack(vcg);

    expect(new TextDecoder().decode(files.get('cg-lottie.js'))).toContain('__cgLottie');
    const indexHtml = new TextDecoder().decode(files.get('index.html'));
    // The player is imported BEFORE cg.js so the global is installed first.
    expect(indexHtml).toContain("import './cg-lottie.js';");
    expect(indexHtml.indexOf('cg-lottie.js')).toBeLessThan(indexHtml.indexOf('./cg.js'));
    // The boot resolves the packaged JSON into lottieAssets (same-origin fetch —
    // allowed by the .vcg's strict 'self' CSP; no external / file:// request).
    expect(indexHtml).toContain('lottieAssets');
    expect(indexHtml).toContain(LOTTIE_PATH);
    expect(indexHtml).toContain('lottieAssets }');
    // Package-relative only — no external/file escape.
    expect(indexHtml).not.toMatch(/(https?:|file:)/);
  });

  it('a scene with NO Lottie packs no player and no lottie import (unchanged)', async () => {
    const { vcg } = await makeExporter().produce(baseScene([]));
    const { files } = await unpack(vcg);

    expect(files.has('cg-lottie.js')).toBe(false);
    const indexHtml = new TextDecoder().decode(files.get('index.html'));
    expect(indexHtml).not.toContain('cg-lottie.js');
    // The empty lottiePaths map still bakes in, but there is no player import.
    expect(indexHtml).not.toContain("import './cg-lottie.js';");
  });

  it('omits the player when no player bundle is provided, but still packs the JSON', async () => {
    const { vcg } = await makeExporter(false).produce(baseScene([lottieElement]));
    const { files } = await unpack(vcg);

    expect(files.get(LOTTIE_PATH)).toEqual(LOTTIE_BYTES); // JSON still packed
    expect(files.has('cg-lottie.js')).toBe(false); // no player
    const indexHtml = new TextDecoder().decode(files.get('index.html'));
    expect(indexHtml).not.toContain("import './cg-lottie.js';");
  });
});
