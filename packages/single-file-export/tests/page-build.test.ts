import { describe, expect, it } from 'vitest';
import {
  CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER,
  CG_LIVE_FRAME_TRANSITION_PAGE_MARKER,
  type Scene,
} from '@cg/shared-schema';
import { sha256Hex } from '@cg/vcg-format';
import { ExporterSingleFile } from '../src/exporter-single-file.js';
import type { ImageAssetSource } from '../src/image-export.js';
import { EXPORTER_SHELL_REVISION, pageRuntimeBuild } from '../src/page-build.js';
import { buildVcgIndexHtml } from '../src/vcg-page.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — the fingerprint a console stamps on every page it builds, and the
 * pin that keeps the exporter's SHELL inside it.
 */

const SCENE = {
  schemaVersion: 1,
  id: 'shell-probe',
  name: 'Shell probe',
  templateType: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  frameRate: 50,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 100 },
  editorBackdrop: 'transparent',
  layers: [],
  fields: [
    { id: 'f0', label: 'Title', required: true, type: 'text', default: 'سلام', maxLength: 80 },
  ],
  bindings: [],
  fonts: [],
  metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
} as unknown as Scene;

/** The shell alone: every runtime input empty, so only what this package writes is hashed. */
async function exportedShell(): Promise<string> {
  const { html } = await new ExporterSingleFile({
    cgJsIife: '',
    cgJsLottieIife: '',
    cgCss: '',
    fontsCss: '',
    assets: { get: async () => null, bytes: async () => null } as unknown as ImageAssetSource,
    fetchUrl: async () => new ArrayBuffer(0),
  }).produce(SCENE);
  return html;
}

async function shellHash(): Promise<string> {
  return sha256Hex(await exportedShell());
}

describe('PAGE-REBUILD-01 — the page runtime fingerprint', () => {
  it('is sixteen hex, the same for the same inputs, and changes with the font CSS', () => {
    const a = pageRuntimeBuild('@font-face{font-family:A}');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(pageRuntimeBuild('@font-face{font-family:A}')).toBe(a);
    expect(pageRuntimeBuild('@font-face{font-family:B}')).not.toBe(a);
    expect(pageRuntimeBuild('')).not.toBe(a);
  });

  it('🔴 the exporter SHELL is pinned beside its revision — if this is red, bump EXPORTER_SHELL_REVISION and re-pin', async () => {
    /*
      A change to what `ExporterSingleFile` writes around the runtime changes every page a console
      builds, and the runtime fingerprint cannot see it (it hashes the runtime's text, not this
      package's code). This pin is what makes that change impossible to ship unnoticed: when it
      reds, raise `EXPORTER_SHELL_REVISION` by one and put the new hash here, so every station
      rebuilds its pages with the new shell on its next upgrade.
    */
    expect({ revision: EXPORTER_SHELL_REVISION, shell: await shellHash() }).toEqual({
      revision: 7,
      shell: 'e407abea5df77cd309b1f321af13164e2ea67350757b52d8d2474fffb751331a',
    });
  });

  it('the shell hash is deterministic (the pin above can hold)', async () => {
    expect(await shellHash()).toBe(await shellHash());
  });

  it('keeps both live frame capability markers in the first 1024 bytes of export', async () => {
    for (const html of [await exportedShell(), buildVcgIndexHtml(SCENE, [], [], false)]) {
      const head = html.slice(0, 1024);
      expect(head).toContain(CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_FRAME_TRANSITION_PAGE_MARKER);
    }
  });
});
