import { describe, expect, it } from 'vitest';
import {
  CG_LIVE_FOCUS_SLIDE_PAGE_MARKER,
  CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER,
  CG_LIVE_FRAME_TRANSITION_PAGE_MARKER,
  CG_LIVE_NATIVE_BORDER_PAGE_MARKER,
  CG_LIVE_PRESET_ARTWORK_FADE_PAGE_MARKER,
  CG_LIVE_PRESET_MIXER_PACING_PAGE_MARKER,
  CG_LIVE_PRESET_RECOVERY_PAGE_MARKER,
  CG_LIVE_PRESET_TITLE_HOLD_PAGE_MARKER,
  CG_LIVE_PRESET_DEPARTURE_PAGE_MARKER,
  CG_LIVE_PRESET_TRANSITION_PAGE_MARKER,
  CG_MANAGED_BOOK_RESUME_RUNTIME_VERSION,
  CG_MANAGED_SEQUENCE_RESUME_PAGE_MARKER_NAME,
  CG_MANAGED_SEQUENCE_RESUME_RUNTIME_VERSION,
  CG_MANAGED_STATIC_RESUME_PAGE_MARKER,
  SequenceElementSchema,
  managedResumePageCountFromHtml,
  CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION,
  withPageLists,
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

/** The shell with a stable capability probe in place of the actual runtime bundle. */
async function exportedShell(
  scene = SCENE,
  runtimeVersion = CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION,
): Promise<string> {
  const { html } = await new ExporterSingleFile({
    cgJsIife: '/* ' + runtimeVersion + ' */',
    cgJsLottieIife: '',
    cgCss: '',
    fontsCss: '',
    assets: { get: async () => null, bytes: async () => null } as unknown as ImageAssetSource,
    fetchUrl: async () => new ArrayBuffer(0),
  }).produce(scene);
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
      revision: 17,
      shell: '29deef2dce472bcab34f916da1f009594ef36c8171dbee28240665a383a2e159',
    });
  });

  it('the shell hash is deterministic (the pin above can hold)', async () => {
    expect(await shellHash()).toBe(await shellHash());
  });

  it('advertises the managed resume capability in the first 1024 bytes of an eligible export', async () => {
    expect((await exportedShell()).slice(0, 1024)).toContain(CG_MANAGED_STATIC_RESUME_PAGE_MARKER);
  });

  it('stamps the authored sequence count only with the matching runtime adapter', async () => {
    const sequence = SequenceElementSchema.parse({
      id: 'sequence',
      name: 'Sequence',
      type: 'sequence',
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 600, h: 160 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      color: '#FFFFFF',
      direction: 'ltr',
      font: {
        family: 'Arial',
        style: 'normal',
        weight: 400,
        size: 36,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      advance: 'manual',
      repeat: 1,
      transitionIn: 'none',
      transitionOut: 'none',
      items: [
        { id: 'a', text: 'One' },
        { id: 'b', text: 'Two' },
      ],
    });
    const scene: Scene = {
      ...SCENE,
      layers: [
        {
          id: 'main',
          name: 'Main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [sequence],
        },
      ],
    };
    const version = CG_MANAGED_SEQUENCE_RESUME_RUNTIME_VERSION;
    const marker =
      '<meta name="' + CG_MANAGED_SEQUENCE_RESUME_PAGE_MARKER_NAME + '" content="2" />';
    for (const html of [
      await exportedShell(scene, version),
      buildVcgIndexHtml(scene, [], [], false, version),
    ]) {
      expect(html.slice(0, 1024)).toContain(marker);
      expect(managedResumePageCountFromHtml(html)).toBe(2);
      expect(
        managedResumePageCountFromHtml(html.replace(marker, marker.replace('2', '-1'))),
      ).toBeUndefined();
      expect(
        managedResumePageCountFromHtml(html.replace(marker, CG_MANAGED_STATIC_RESUME_PAGE_MARKER)),
      ).toBe(1);
    }
    for (const invalidHead of [
      '<head></head><body>' + marker + '</body>',
      '<head><!-- ' + marker + ' --></head>',
      '<head><script>const probe = ' + JSON.stringify(marker) + '</script></head>',
      '<head>' + marker + marker + '</head>',
    ]) {
      expect(managedResumePageCountFromHtml('<html>' + invalidHead + '</html>')).toBeUndefined();
    }
    const pictureBook = withPageLists({
      ...scene,
      layers: scene.layers.map((layer) => ({
        ...layer,
        children: [
          {
            ...sequence,
            items: [
              { id: 'a', kind: 'image', assetId: 'photo-a' },
              { id: 'b', kind: 'image', assetId: 'photo-b' },
            ],
          },
        ],
      })),
    });
    expect(
      managedResumePageCountFromHtml(buildVcgIndexHtml(pictureBook, [], [], false, version)),
    ).toBeUndefined();
    expect(
      managedResumePageCountFromHtml(
        buildVcgIndexHtml(pictureBook, [], [], false, CG_MANAGED_BOOK_RESUME_RUNTIME_VERSION),
      ),
    ).toBe(2);
    expect(managedResumePageCountFromHtml(await exportedShell(scene))).toBeUndefined();
    expect(managedResumePageCountFromHtml(await exportedShell())).toBe(1);
  });

  it('keeps the live frame capability markers in the first 1024 bytes of export', async () => {
    for (const html of [await exportedShell(), buildVcgIndexHtml(SCENE, [], [], false)]) {
      const head = html.slice(0, 1024);
      expect(head).toContain(CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_FRAME_TRANSITION_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_PRESET_TRANSITION_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_PRESET_DEPARTURE_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_PRESET_ARTWORK_FADE_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_PRESET_MIXER_PACING_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_NATIVE_BORDER_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_PRESET_RECOVERY_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_PRESET_TITLE_HOLD_PAGE_MARKER);
      expect(head).toContain(CG_LIVE_FOCUS_SLIDE_PAGE_MARKER);
    }
  });
});
