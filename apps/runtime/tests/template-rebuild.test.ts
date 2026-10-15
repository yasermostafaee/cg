import { describe, expect, it, vi } from 'vitest';
import { pack, sha256Hex } from '@cg/vcg-format';
import type { AssetEntry, FontReference, Manifest, Scene } from '@cg/shared-schema';
import type {
  ChannelRequest,
  PageBuild,
  TemplateInfo,
  TemplatesImportChannel,
  TemplatesRebuildChannel,
} from '@cg/shared-ipc';
import {
  importTemplateFromBytes,
  pageBuildOf,
  type TemplateImportBridge,
} from '../src/renderer/features/library/templateDelivery.js';
import {
  rebuildFailedLine,
  rebuiltLine,
  reimportLine,
  runRebuildPass,
  type TemplateRebuildBridge,
} from '../src/renderer/features/library/templateRebuild.js';
import { bytesToBase64 } from '../src/renderer/features/library/packageBytes.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **CG CONTROL KEEPS WHAT IT VERIFIED, AND BUILDS FROM NOTHING ELSE.**
 *
 * The import keeps the exact `.vcg` it verified on CG Bridge and stamps the page with the runtime
 * that built it; a console with another runtime reads the package back, checks it is the verified
 * one, runs the SAME verify → unpack → bake, and sends the page. A package that no longer verifies is
 * reported, never built.
 */

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-rebuild-1',
    name: 'خبر فوری',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'Content',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'el-logo',
            name: 'logo',
            type: 'image',
            transform: {
              position: { x: 40, y: 40 },
              size: { w: 200, h: 200 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            assetId: 'img-logo',
            source: 'project',
            fit: 'contain',
            preserveAspect: true,
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-30T00:00:00.000Z', updatedAt: '2026-06-30T00:00:00.000Z' },
  } as unknown as Scene;
}

async function vcg(templateId = 'tpl-rebuild'): Promise<Uint8Array> {
  const assetPath = `assets/image/${sha256Hex(PNG_1X1)}.png`;
  const assetIndex: readonly AssetEntry[] = [
    {
      id: 'img-logo',
      path: assetPath,
      kind: 'image',
      bytes: PNG_1X1.byteLength,
      sha256: sha256Hex(PNG_1X1),
      mime: 'image/png',
    },
  ];
  const fontDeps: readonly FontReference[] = [];
  return pack({
    scene: scene(),
    manifestExtras: {
      id: templateId,
      name: 'خبر فوری',
      authoring: {
        designerVersion: '0.0.0',
        createdAt: '2026-06-30T00:00:00.000Z',
        exportedAt: '2026-06-30T00:01:00.000Z',
      },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
      fontDeps,
      assetIndex,
    } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
      fontDeps: readonly FontReference[];
      assetIndex: readonly AssetEntry[];
    },
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder */',
    cgCss: '/* placeholder */',
    assets: new Map([[assetPath, PNG_1X1]]),
  });
}

/**
 * The same package with ONE byte of its image changed. Images are STORED in a `.vcg` and the zip
 * reader does not check CRCs, so the archive still opens: only `verify`'s integrity check can see it.
 */
function tampered(bytes: Uint8Array): Uint8Array {
  const out = Uint8Array.from(bytes);
  const idat = [0x49, 0x44, 0x41, 0x54]; // "IDAT", inside the stored PNG
  for (let i = 0; i < out.length - 8; i += 1) {
    if (idat.every((b, k) => out[i + k] === b)) {
      out[i + 6] = (out[i + 6] ?? 0) ^ 0xff;
      return out;
    }
  }
  throw new Error('the stored PNG was not found in the package');
}

const OLD: PageBuild = { consoleVersion: '0.11.6', runtimeBuild: 'aaaaaaaaaaaaaaaa' };

describe('PAGE-REBUILD-01 — the import keeps its inputs', () => {
  it('🔴 the package VERIFIED is the one kept, byte for byte, and the import names it and the runtime that built the page', async () => {
    const bytes = await vcg();
    const puts: string[] = [];
    const imports: ChannelRequest<typeof TemplatesImportChannel>[] = [];
    const bridge: TemplateImportBridge = {
      templates: {
        putSource: (req) => {
          puts.push(req.base64);
          return Promise.resolve({ stored: true, sha256: sha256Hex(bytes) });
        },
        import: (req) => {
          imports.push(req);
          return Promise.resolve({ registered: true, templateId: req.template.templateId });
        },
      },
    };

    await importTemplateFromBytes(bridge, bytes, { consoleVersion: '0.12.0' });

    expect(puts).toEqual([bytesToBase64(bytes)]);
    expect(imports).toHaveLength(1);
    expect(imports[0]?.sourceSha256).toBe(sha256Hex(bytes));
    expect(imports[0]?.build).toEqual(pageBuildOf('0.12.0', ''));
    expect(imports[0]?.build?.runtimeBuild).toMatch(/^[0-9a-f]{16}$/);
  });

  it('a bridge that answers another hash, refuses, or cannot keep anything leaves the import unchanged, naming no package', async () => {
    const bytes = await vcg();
    for (const putSource of [
      () => Promise.resolve({ stored: true, sha256: 'f'.repeat(64) }),
      () => Promise.resolve({ stored: false, message: 'too large' }),
      () => Promise.reject(new Error('socket closed')),
    ]) {
      const imported = vi.fn((req: ChannelRequest<typeof TemplatesImportChannel>) =>
        Promise.resolve({ registered: true, templateId: req.template.templateId }),
      );
      await importTemplateFromBytes({ templates: { putSource, import: imported } }, bytes, {
        consoleVersion: '0.12.0',
      });
      expect(imported).toHaveBeenCalledTimes(1);
      expect(imported.mock.calls[0]?.[0].sourceSha256).toBeUndefined();
      expect(imported.mock.calls[0]?.[0].build).toEqual(pageBuildOf('0.12.0', ''));
    }
  });

  it('control: a caller that names no console version keeps nothing and stamps nothing (the byte-only path)', async () => {
    const bytes = await vcg();
    const putSource = vi.fn();
    const imported = vi.fn((req: ChannelRequest<typeof TemplatesImportChannel>) =>
      Promise.resolve({ registered: true, templateId: req.template.templateId }),
    );
    await importTemplateFromBytes({ templates: { putSource, import: imported } }, bytes);
    expect(putSource).not.toHaveBeenCalled();
    expect(imported.mock.calls[0]?.[0].build).toBeUndefined();
  });
});

/** A bridge holding one kept package, recording what the console sends back. */
function rebuildBridge(
  kept: Uint8Array,
  entrySha = sha256Hex(kept),
  template: TemplateInfo = {
    templateId: 'tpl-rebuild',
    name: 'خبر فوری',
    sourceFileName: 'khabar.vcg',
    templateType: 'lower-third',
    fields: [],
  },
): TemplateRebuildBridge & { sent: ChannelRequest<typeof TemplatesRebuildChannel>[] } {
  const sent: ChannelRequest<typeof TemplatesRebuildChannel>[] = [];
  return {
    sent,
    templates: {
      rebuildPlan: () =>
        Promise.resolve({
          rebuild: [{ versionId: 'v-old', template, sourceSha256: entrySha }],
          reimport: [],
        }),
      source: () => Promise.resolve({ ok: true as const, base64: bytesToBase64(kept) }),
      rebuild: (req) => {
        sent.push(req);
        return Promise.resolve({ outcome: req.result.ok ? 'rebuilt' : 'recorded' } as const);
      },
    },
  };
}

describe('PAGE-REBUILD-01 — a console with another runtime builds the page again', () => {
  it('🔴 reads the kept package back, builds it through the import’s own path, and sends the page — the operator’s file name kept', async () => {
    const bridge = rebuildBridge(await vcg());
    const build = pageBuildOf('0.12.0', '');

    const result = await runRebuildPass(bridge, { build });

    expect(result).toEqual({ rebuilt: 1, deferred: [], failed: [] });
    expect(bridge.sent).toHaveLength(1);
    const sent = bridge.sent[0];
    expect(sent?.versionId).toBe('v-old');
    expect(sent?.build).toEqual(build);
    if (sent?.result.ok !== true) throw new Error('expected a built page');
    expect(sent.result.template.templateId).toBe('tpl-rebuild');
    expect(sent.result.template.sourceFileName).toBe('khabar.vcg');
    expect(sent.result.html).toContain('CG.createRuntime(scene');
  });

  it('🔴 THE SIGNATURE CHECK STILL RUNS: a kept package that no longer verifies is reported, never built', async () => {
    const bad = tampered(await vcg());
    // The bridge's hash is of the bytes it holds, so the hash check alone passes — only verify can see it.
    const bridge = rebuildBridge(bad);

    const result = await runRebuildPass(bridge, { build: pageBuildOf('0.12.0', '') });

    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0]?.result).toMatchObject({ ok: false });
    // `B-350` — bytes changed since export read as damaged, in the operator's words.
    expect(bridge.sent[0]?.result.ok === false && bridge.sent[0].result.reason).toMatch(
      /is damaged or not a CG template/,
    );
    expect(result.rebuilt).toBe(0);
    expect(result.failed.map((f) => f.template.templateId)).toEqual(['tpl-rebuild']);
  });

  it('bytes that are not the package verified at import are refused before anything is built', async () => {
    const bridge = rebuildBridge(await vcg(), 'e'.repeat(64));
    await runRebuildPass(bridge, { build: pageBuildOf('0.12.0', '') });
    expect(bridge.sent[0]?.result).toEqual({
      ok: false,
      reason: 'the package kept at import is not the one that was verified',
    });
  });

  it('a bridge that cannot answer the plan ends the pass quietly', async () => {
    const result = await runRebuildPass(
      {
        templates: {
          rebuildPlan: () => Promise.reject(new Error('refused')),
          source: vi.fn(),
          rebuild: vi.fn(),
        },
      },
      { build: OLD },
    );
    expect(result).toEqual({ rebuilt: 0, deferred: [], failed: [] });
  });
});

describe('PAGE-REBUILD-01 — the operator is told once, in his words', () => {
  const t = (name: string): TemplateInfo => ({
    templateId: `id-${name}`,
    name,
    templateType: 'lower-third',
    fields: [],
  });

  it('one sentence for the whole pass, naming each template, never its id', () => {
    expect(rebuildFailedLine([])).toBeNull();
    expect(rebuildFailedLine([{ template: t('خبر') }])).toBe(
      '“خبر” could not be rebuilt for this CG Control, so it plays as before. Import it again.',
    );
    const many = rebuildFailedLine([{ template: t('A') }, { template: t('B') }]) ?? '';
    expect(many).toBe(
      '2 templates could not be rebuilt for this CG Control, so they play as before: “A”, “B”. Import them again.',
    );
    expect(many).not.toContain('id-');
  });

  it('the Library line counts what it names', () => {
    expect(reimportLine(1)).toBe('Re-import 1 template');
    expect(reimportLine(3)).toBe('Re-import these 3 templates');
  });

  it('a pass that rebuilt says how many in one line, and names the ones waiting for their row', () => {
    expect(rebuiltLine({ rebuilt: 0, deferred: [] })).toBeNull();
    expect(rebuiltLine({ rebuilt: 3, deferred: [] })).toBe(
      'Rebuilt for this CG Control · 3 templates',
    );
    expect(rebuiltLine({ rebuilt: 1, deferred: [t('خبر')] })).toBe(
      'Rebuilt for this CG Control · 2 templates · “خبر” waits until its row is cleared',
    );
    expect(rebuiltLine({ rebuilt: 0, deferred: [t('A'), t('B')] })).toBe(
      'Rebuilt for this CG Control · 2 templates · “A”, “B” wait until their rows are cleared',
    );
  });
});
