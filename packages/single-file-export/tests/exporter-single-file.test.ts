import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';
import { ExporterSingleFile } from '../src/exporter-single-file.js';
import type { ImageAssetSource } from '../src/image-export.js';

function makeScene(): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    name: 'My Template',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [],
    fields: [
      { id: 'f0', label: 'Title', required: true, type: 'text', default: 'Hello', maxLength: 100 },
      { id: 'logo', label: 'Logo', required: false, type: 'image', accept: ['png'] },
    ],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as Scene;
}

function makeExporter(): ExporterSingleFile {
  return new ExporterSingleFile({
    cgJsIife:
      'var CG = { createRuntime: function () { return { ready: Promise.resolve() }; }, installCasparGlobals: function () {} };',
    cgCss: 'html,body{background:transparent}',
    fontsCss: "@font-face{font-family:'Vazirmatn';src:url('/fonts/v.woff2') format('woff2')}",
    assets: { bytes: async () => null } as unknown as ImageAssetSource,
    fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
}

describe('ExporterSingleFile', () => {
  it('produces one self-contained HTML with no external resource references', async () => {
    const { html, filename } = await makeExporter().produce(makeScene());

    expect(filename).toBe('My-Template.html');
    // No external resource loads: no module imports, no fetch, no <link>, no
    // remote src/href, and the bundled font URL is inlined to a data URI.
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/\bfetch\(/);
    expect(html).not.toMatch(/import\s/);
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href=/);
    expect(html).not.toContain('/fonts/v.woff2');
    expect(html).toContain('url(data:font/woff2;base64,');
    // Scene inlined as a JS literal + the IIFE runtime bootstrap.
    expect(html).toContain('var scene =');
    // D-137 §9 — the boot call now NAMES its render mode; 'output' is what makes a
    // Live Source paint zero pixels in the artifact that goes on air.
    expect(html).toContain("CG.createRuntime(scene, { mode: 'output', assetUrls:");
    expect(html).toContain('CG.installCasparGlobals');
    // R-011 — the ON-AIR boot applies the output position (query override ??
    // scene.defaultPosition ?? centered). This boot script is the ONLY caller;
    // the Designer preview never applies positioning.
    expect(html).toContain('CG.applyOutputPosition(scene, { search: location.search })');
    // B-066 — a boot failure must be VISIBLE on the output (try/catch +
    // "cg boot error" pre), never a silent blank whose only trace is
    // "update is not defined" in the CEF log.
    expect(html).toContain("'cg boot error: '");
  });

  it('embeds a parseable GDD schema with the dynamic fields', async () => {
    const { html, issues } = await makeExporter().produce(makeScene());

    const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const gdd = JSON.parse((m?.[1] ?? '').trim()) as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    expect(gdd.properties['f0']?.type).toBe('string');
    expect(gdd.required).toContain('f0');

    // An image field is exported but flagged as not portable to third-party clients.
    expect(issues.some((i) => i.fieldId === 'logo' && i.severity === 'warning')).toBe(true);
  });

  it('embeds D-020 out-point + playout metadata with the outro duration (ms)', async () => {
    const scene: Scene = {
      ...makeScene(),
      lifecycle: { outPoint: 80 },
      playout: { mode: 'auto-out', holdMs: 3000 },
    } as unknown as Scene;
    const { html } = await makeExporter().produce(scene);

    const m = /<script name="cg-playout"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const meta = JSON.parse((m?.[1] ?? '').trim()) as Record<string, unknown>;
    expect(meta).toMatchObject({
      mode: 'auto-out',
      holdMs: 3000,
      outPoint: 80,
      // (100 - 80) / 50 fps * 1000 = 400 ms
      outroDurationMs: 400,
    });
  });

  it('D-112 — inlines per-instance holdOverrides into the exported scene', async () => {
    const scene: Scene = {
      ...makeScene(),
      layers: [
        {
          id: 'L0',
          name: 'Layer 1',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'inst-1',
              name: 'nested',
              type: 'composition',
              compositionId: 'child',
              transform: {
                position: { x: 0, y: 0 },
                size: { w: 100, h: 100 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
              holdOverrides: { 'seq-1': false },
            },
          ],
        },
      ],
    } as unknown as Scene;
    const { html } = await makeExporter().produce(scene);

    // The whole scene is inlined as a JS literal (JSON.stringify), so the per-instance override
    // ships in the exported single-file HTML and on-air matches the preview.
    expect(html).toContain('"holdOverrides"');
    expect(html).toContain('"seq-1":false');
  });
});

describe('ExporterSingleFile — B-129 the editor backdrop never reaches the artifact', () => {
  it('embeds a scene whose backdrop is transparent, from a scene that had a colour', () => {
    // The artifact side of the split, on the OTHER exporter — asserted here as well as
    // in `@cg/vcg-format` because two exporters that disagree about this is exactly the
    // failure the ONE shared helper exists to prevent.
    const scene: Scene = { ...makeScene(), editorBackdrop: '#123456' };
    return makeExporter()
      .produce(scene)
      .then(({ html }) => {
        expect(html).not.toContain('#123456');
        expect(html).toContain('"editorBackdrop":"transparent"');
      });
  });
});

describe('ExporterSingleFile — D-028 list field / ticker preflight', () => {
  it('exports a list field as a GDD array and warns about limited third-party clients', async () => {
    const scene: Scene = {
      ...makeScene(),
      fields: [
        {
          id: 'headlines',
          label: 'Headlines',
          required: false,
          type: 'list',
          default: [{ id: 'i1', text: 'خبر' }],
        },
      ],
    } as unknown as Scene;
    const { html, issues } = await makeExporter().produce(scene);

    const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    const gdd = JSON.parse((m?.[1] ?? '').trim()) as {
      properties: Record<string, { type: string; items?: { type: string } }>;
    };
    expect(gdd.properties['headlines']?.type).toBe('array');
    expect(gdd.properties['headlines']?.items?.type).toBe('object');

    expect(
      issues.some(
        (i) =>
          i.code === 'gdd-list-field-limited-clients' &&
          i.severity === 'warning' &&
          i.fieldId === 'headlines',
      ),
    ).toBe(true);
  });
});

describe('ExporterSingleFile — D-027 clock is export/GDD-neutral', () => {
  it('a clock adds no fields: the GDD and preflight are unchanged; the scene literal carries it', async () => {
    const base = makeScene();
    const withClock: Scene = {
      ...base,
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'clk-1',
              name: 'Clock',
              type: 'clock',
              transform: {
                position: { x: 100, y: 100 },
                size: { w: 320, h: 84 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0.5, y: 0.5 },
              },
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
              font: {
                family: 'Vazirmatn',
                weight: 600,
                style: 'normal',
                size: 48,
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              align: 'center',
              mode: 'countdown',
              format: 'mm:ss',
              digits: 'persian',
              target: { kind: 'duration', ms: 120_000 },
            },
          ],
        },
      ],
    } as unknown as Scene;
    const withoutClock: Scene = {
      ...withClock,
      layers: [{ ...withClock.layers[0]!, children: [] }],
    } as Scene;

    const a = await makeExporter().produce(withoutClock);
    const b = await makeExporter().produce(withClock);

    const gddOf = (html: string): unknown => {
      const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
      return JSON.parse((m?.[1] ?? '').trim());
    };
    // The clock adds no dynamic fields ⇒ the GDD is byte-for-byte the same…
    expect(gddOf(b.html)).toEqual(gddOf(a.html));
    // …no new preflight issues appear…
    expect(b.issues).toEqual(a.issues);
    // …and the element ships inside the inlined scene (the bundled runtime
    // carries its driver — no boot wiring in the emitted HTML changes).
    expect(b.html).toContain('"type":"clock"');
    // D-137 §9 — the boot call now NAMES its render mode; 'output' is what makes a
    // Live Source paint zero pixels in the artifact that goes on air.
    expect(b.html).toContain("CG.createRuntime(scene, { mode: 'output', assetUrls:");
  });
});

describe('ExporterSingleFile — D-029 sequence rides the existing list/GDD path', () => {
  it('the export carries the sequence; a bound list field GDDs exactly as D-028', async () => {
    const scene: Scene = {
      ...makeScene(),
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'sq-1',
              name: 'NowNext',
              type: 'sequence',
              transform: {
                position: { x: 100, y: 900 },
                size: { w: 720, h: 72 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0.5, y: 0.5 },
              },
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
              font: {
                family: 'Vazirmatn',
                weight: 500,
                style: 'normal',
                size: 36,
                lineHeight: 1.4,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              align: 'start',
              direction: 'rtl',
              items: [{ id: 'a', text: 'اکنون: یک', dwellMs: 800 }],
              defaultDwellMs: 5000,
              advance: 'auto',
              transitionIn: 'bottom',
              transitionOut: 'top',
              transitionTiming: 'simultaneous',
              transitionMs: 400,
              repeat: 'infinite',
            },
          ],
        },
      ],
      fields: [
        {
          id: 'rundown',
          label: 'Rundown',
          required: false,
          type: 'list',
          default: [{ id: 'a', text: 'اکنون: یک', dwellMs: 800 }],
        },
      ],
      bindings: [{ fieldId: 'rundown', target: { kind: 'sequence-items', elementId: 'sq-1' } }],
    } as unknown as Scene;
    const { html, issues } = await makeExporter().produce(scene);

    // The element ships inside the inlined scene; the bundled runtime carries
    // its driver and the real next() — no emitted-boot changes.
    expect(html).toContain('"type":"sequence"');
    // D-137 §9 — the boot call now NAMES its render mode; 'output' is what makes a
    // Live Source paint zero pixels in the artifact that goes on air.
    expect(html).toContain("CG.createRuntime(scene, { mode: 'output', assetUrls:");
    // The bound list field exports as the SAME typed GDD array D-028 defined.
    const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    const gdd = JSON.parse((m?.[1] ?? '').trim()) as {
      properties: Record<string, { type: string; items?: { type: string } }>;
    };
    expect(gdd.properties['rundown']?.type).toBe('array');
    expect(gdd.properties['rundown']?.items?.type).toBe('object');
    // The existing JSON-only/limited-clients warning covers the list field.
    expect(issues.some((i) => i.code === 'gdd-list-field-limited-clients')).toBe(true);
  });
});

describe('ExporterSingleFile — D-125 Lottie inlining + conditional player bundle', () => {
  const animationData = { v: '5.7', fr: 30, ip: 0, op: 60, w: 400, h: 200, layers: [] };
  const lottieBytes = new TextEncoder().encode(JSON.stringify(animationData));
  const lottieAssetSource = {
    get: async (id: string): Promise<AssetMeta> =>
      ({
        assetId: id,
        filename: 'furniture.json',
        kind: 'lottie',
        sha256: 'abc',
        bytes: 1,
      }) as AssetMeta,
    bytes: async () => lottieBytes,
  } as unknown as ImageAssetSource;

  const PLAYER = 'globalThis.__cgLottie = { loadAnimation: function () {} };';

  function lottieExporter(withPlayer = true): ExporterSingleFile {
    return new ExporterSingleFile({
      cgJsIife:
        'var CG = { createRuntime: function () { return { ready: Promise.resolve() }; }, installCasparGlobals: function () {}, applyOutputPosition: function () {} };',
      ...(withPlayer ? { cgJsLottieIife: PLAYER } : {}),
      cgCss: 'html,body{background:transparent}',
      fontsCss: '',
      assets: lottieAssetSource,
    });
  }

  function sceneWithLottie(): Scene {
    return {
      ...makeScene(),
      fields: [],
      layers: [
        {
          id: 'L1',
          name: 'furniture',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'lot-1',
              name: 'lower-third',
              type: 'lottie',
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
              assetId: 'lottie-asset',
              speed: 1,
              loopMode: 'none',
              holdBehavior: 'freeze',
              phases: { introEnd: 20, outroStart: 50, source: 'markers' },
            },
          ],
        },
      ],
    } as unknown as Scene;
  }

  it('a NO-Lottie export omits the player bundle and inlines an empty lottieAssets map', async () => {
    const { html } = await lottieExporter().produce(makeScene());
    expect(html).not.toContain('__cgLottie'); // player NOT shipped
    expect(html).toContain('lottieAssets: {}'); // empty map baked in
  });

  it('a WITH-Lottie export inlines the JSON + the player, with zero external requests', async () => {
    const { html, issues } = await lottieExporter().produce(sceneWithLottie());
    // The player bundle is appended (installs the global) BEFORE createRuntime.
    expect(html).toContain('__cgLottie');
    expect(html.indexOf('__cgLottie')).toBeLessThan(html.indexOf('createRuntime'));
    // The JSON is inlined as a JS literal in the lottieAssets map (no fetch).
    expect(html).toContain('lottieAssets: {');
    expect(html).toContain('"lottie-asset"');
    expect(html).toContain('"op":60');
    // D-137 §9 — the boot call now NAMES its render mode; 'output' is what makes a
    // Live Source paint zero pixels in the artifact that goes on air.
    expect(html).toContain(
      "CG.createRuntime(scene, { mode: 'output', assetUrls: {}, lottieAssets: {",
    );
    // Self-contained under CEF from file:// — zero external requests.
    expect(html).not.toMatch(/\bfetch\(/);
    expect(html).not.toMatch(/import\s/);
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/<link\b/);
    // The asset resolved cleanly — no missing-asset warning.
    expect(issues.some((i) => i.elementId === 'lot-1')).toBe(false);
  });

  it('warns (never throws) when a Lottie is present but no player bundle was provided', async () => {
    const { html, issues } = await lottieExporter(false).produce(sceneWithLottie());
    // JSON still inlined, but the player is absent (a warning, not a crash).
    expect(html).toContain('"lottie-asset"');
    expect(html).not.toContain('__cgLottie');
    expect(issues.some((i) => i.severity === 'warning' && /player bundle/.test(i.message))).toBe(
      true,
    );
  });

  it('warns when the Lottie JSON cannot be resolved (missing asset)', async () => {
    const nullSource = {
      get: async () => null,
      bytes: async () => null,
    } as unknown as ImageAssetSource;
    const exporter = new ExporterSingleFile({
      cgJsIife: 'var CG = {};',
      cgJsLottieIife: PLAYER,
      cgCss: '',
      fontsCss: '',
      assets: nullSource,
    });
    const { issues } = await exporter.produce(sceneWithLottie());
    expect(issues.some((i) => i.code === 'missing-asset' && i.elementId === 'lot-1')).toBe(true);
  });
});

describe('ExporterSingleFile — D-128 Phase 5 video inlining', () => {
  // Recognizable WebM-ish bytes so the base64 round-trip is verifiable.
  const videoBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 10, 20, 30, 40, 50]);
  const videoAssetSource = {
    get: async (id: string): Promise<AssetMeta | null> =>
      id.startsWith('vid-')
        ? ({
            assetId: id,
            filename: `${id}.webm`,
            kind: 'video',
            sha256: 'a'.repeat(64),
            byteSize: videoBytes.byteLength,
          } as unknown as AssetMeta)
        : null,
    bytes: async (id: string) => (id.startsWith('vid-') ? videoBytes : null),
  } as unknown as ImageAssetSource;

  function videoExporter(assets: ImageAssetSource = videoAssetSource): ExporterSingleFile {
    return new ExporterSingleFile({
      cgJsIife:
        'var CG = { createRuntime: function () { return { ready: Promise.resolve() }; }, installCasparGlobals: function () {}, applyOutputPosition: function () {} };',
      cgCss: 'html,body{background:transparent}',
      fontsCss: '',
      assets,
    });
  }

  function videoEl(id: string, assetId: string): Record<string, unknown> {
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

  function sceneWithVideos(...assetIds: string[]): Scene {
    return {
      ...makeScene(),
      fields: [],
      layers: [
        {
          id: 'L1',
          name: 'clips',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: assetIds.map((a, i) => videoEl(`v${String(i)}`, a)),
        },
      ],
    } as unknown as Scene;
  }

  const expectedDataUri = `data:video/webm;base64,${btoa(String.fromCharCode(...videoBytes))}`;

  it('inlines the stored bytes as a data:video/webm URI in the assetUrls map — zero external refs', async () => {
    const { html, issues } = await videoExporter().produce(sceneWithVideos('vid-1'));
    expect(html).toContain(`"vid-1":"${expectedDataUri}"`);
    expect(issues.filter((i) => i.code === 'missing-asset')).toEqual([]);
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/\bfetch\(/);
  });

  it('the artifact CSP admits the inlined video (media-src data:) — the artifact must not block its own bytes', async () => {
    const { html } = await videoExporter().produce(sceneWithVideos('vid-1'));
    const csp = /Content-Security-Policy"\s*content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp).toContain('media-src data:');
    expect(csp).toContain("default-src 'none'");
  });

  it('MULTI-VIDEO: every distinct asset inlines once; a repeated asset is not duplicated', async () => {
    const { html } = await videoExporter().produce(sceneWithVideos('vid-1', 'vid-2', 'vid-1'));
    expect(html).toContain(`"vid-1":"${expectedDataUri}"`);
    expect(html).toContain(`"vid-2":"${expectedDataUri}"`);
    // one inline per ASSET, not per element: 2 data URIs for 3 video elements
    const occurrences = html.split('data:video/webm;base64,').length - 1;
    expect(occurrences).toBe(2);
  });

  it('a video whose bytes cannot resolve is a WARNING on this never-blocking path (the Designer preflight owns the error)', async () => {
    const { html, issues } = await videoExporter().produce(sceneWithVideos('gone-1'));
    const missing = issues.filter((i) => i.code === 'missing-asset');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.severity).toBe('warning');
    expect(missing[0]?.message).toContain('Video element');
    expect(html).not.toContain('data:video/webm'); // nothing bogus inlined
  });
});

describe('ExporterSingleFile — D-028 finite ticker under a TIMED hold (info)', () => {
  it('flags the combo as info (authored intent, never blocks)', async () => {
    const scene: Scene = {
      ...makeScene(),
      playout: { mode: 'auto-out', holdMs: 3000 },
      layers: [
        {
          id: 'L1',
          name: 'band',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'tk-1',
              name: 'Crawl',
              type: 'ticker',
              transform: {
                position: { x: 0, y: 980 },
                size: { w: 1200, h: 72 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
              font: {
                family: 'Vazirmatn',
                weight: 500,
                style: 'normal',
                size: 36,
                lineHeight: 1.4,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              direction: 'rtl',
              speed: 120,
              repeat: 2,
              cycleBoundary: 'seamless',
              gap: 48,
              items: [{ id: 'i1', text: 'sample' }],
            },
          ],
        },
      ],
      fields: [],
    } as unknown as Scene;
    const { issues } = await makeExporter().produce(scene);
    const info = issues.find((i) => i.code === 'ticker-finite-with-timed-hold');
    expect(info).toBeDefined();
    expect(info?.severity).toBe('info');
    expect(info?.elementId).toBe('tk-1');
  });

  it('stays silent when the hold is content-driven', async () => {
    const scene: Scene = {
      ...makeScene(),
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      layers: [],
      fields: [],
    } as unknown as Scene;
    const { issues } = await makeExporter().produce(scene);
    expect(issues.some((i) => i.code === 'ticker-finite-with-timed-hold')).toBe(false);
  });

  it('B-034 — a HIDDEN finite ticker is inert: it raises no preflight diagnostic', async () => {
    const scene: Scene = {
      ...makeScene(),
      playout: { mode: 'auto-out', holdMs: 3000 },
      layers: [
        {
          id: 'L1',
          name: 'band',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'tk-hidden',
              name: 'Crawl',
              type: 'ticker',
              transform: {
                position: { x: 0, y: 980 },
                size: { w: 1200, h: 72 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              visible: false, // hidden ⇒ fully inert (not rendered, not a hold driver, no diagnostic)
              locked: false,
              zIndex: 0,
              font: {
                family: 'Vazirmatn',
                weight: 500,
                style: 'normal',
                size: 36,
                lineHeight: 1.4,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              direction: 'rtl',
              speed: 120,
              repeat: 2,
              cycleBoundary: 'seamless',
              gap: 48,
              items: [{ id: 'i1', text: 'sample' }],
            },
          ],
        },
      ],
      fields: [],
    } as unknown as Scene;
    const { issues } = await makeExporter().produce(scene);
    expect(issues.some((i) => i.code === 'ticker-finite-with-timed-hold')).toBe(false);
  });
});

describe('ExporterSingleFile — D-149 image fit width / height', () => {
  /** An asset source that resolves `a1`, so the image path actually runs. */
  function fitExporter(): ExporterSingleFile {
    return new ExporterSingleFile({
      cgJsIife: 'var CG = {};',
      cgCss: 'html,body{background:transparent}',
      fontsCss: '',
      assets: {
        get: async () => ({ id: 'a1', filename: 'logo.png', mime: 'image/png' }) as AssetMeta,
        bytes: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      } as unknown as ImageAssetSource,
      fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
  }

  function sceneWithFit(fit: string): Scene {
    const base = makeScene();
    return {
      ...base,
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'img-1',
              name: 'Logo',
              type: 'image',
              visible: true,
              locked: false,
              opacity: 1,
              zIndex: 0,
              transform: {
                position: { x: 10, y: 20 },
                size: { w: 320, h: 180 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              assetId: 'a1',
              source: 'project',
              fit,
              preserveAspect: true,
            },
          ],
        },
      ],
    } as unknown as Scene;
  }

  it.each(['contain', 'cover', 'fill', 'none', 'fit-width', 'fit-height'])(
    'the exported scene literal carries fit `%s` verbatim',
    async (fit) => {
      // The single-file export bakes the SCENE and builds the DOM at load, so
      // "round-trips through the exporter" means the value reaches the page
      // unchanged — including `none`, which the Designer merely LABELS
      // "original" (D-149: the stored value never changes).
      const { html } = await fitExporter().produce(sceneWithFit(fit));
      expect(html).toContain(`"fit":"${fit}"`);
    },
  );

  it('a pre-existing fit mode adds NO wrapper markup to the export', async () => {
    // The on-air guarantee, asserted on the exporter rather than only on the
    // builder: a template that uses none of the new options must export what it
    // always did. The DOM-level byte-identity proof is
    // `@cg/template-runtime` tests/image-fit.test.ts.
    for (const fit of ['contain', 'cover', 'fill', 'none']) {
      const { html } = await fitExporter().produce(sceneWithFit(fit));
      expect(html).not.toContain('fit-width');
      expect(html).not.toContain('fit-height');
    }
  });
});

/**
 * ⭐ Task 1.5e — the frame survives the SINGLE-FILE exporter (the `.vcg` half is
 * pinned in `packages/vcg-format/tests/roundtrip.test.ts`).
 *
 * The artifact CEF loads is this HTML, and it does not carry a pre-rendered plate:
 * the scene is inlined as a JS literal and `CG.createRuntime(scene, { mode: 'output'
 * … })` builds the DOM at load. So the round-trip assertion here is about the
 * EMBEDDED SCENE — if the stroke is not in that literal, no border can exist on air,
 * whatever `buildScene` would have done with it.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "A Live Source may carry a FRAME, and the frame never enters the hole"
 */
describe('1.5e — a Live Source FRAME reaches the single-file artifact', () => {
  function framedScene(stroke?: unknown): Scene {
    return {
      ...makeScene(),
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'live-a',
              name: 'Guest box',
              type: 'video-placeholder',
              transform: {
                position: { x: 300, y: 200 },
                size: { w: 640, h: 360 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
              routeKey: 'guest-1',
              ...(stroke !== undefined ? { stroke } : {}),
            },
          ],
        },
      ],
    } as unknown as Scene;
  }

  /** The inlined `var scene = …` literal, parsed back out of the artifact. */
  function embeddedScene(html: string): Scene {
    const m = /var scene = (\{[\s\S]*?\});\n/.exec(html);
    if (m?.[1] === undefined) throw new Error('no inlined scene literal in the artifact');
    return JSON.parse(m[1].replace(/\u003c/g, '<')) as Scene;
  }

  it('the inlined scene carries the stroke, so the plate can paint its frame on air', async () => {
    const { html } = await makeExporter().produce(framedScene({ width: 6, color: '#ff8800' }));
    const el = embeddedScene(html).layers[0]?.children[0] as { stroke?: unknown } | undefined;
    expect(el?.stroke).toEqual({ width: 6, color: '#ff8800' });
  });

  it('a ZERO width survives as a stored state rather than being dropped', async () => {
    const { html } = await makeExporter().produce(framedScene({ width: 0, color: '#00ff00' }));
    const el = embeddedScene(html).layers[0]?.children[0] as { stroke?: unknown } | undefined;
    expect(el?.stroke).toEqual({ width: 0, color: '#00ff00' });
  });

  it('an UNFRAMED plate inlines with no stroke key at all', async () => {
    const { html } = await makeExporter().produce(framedScene());
    const el = embeddedScene(html).layers[0]?.children[0] as Record<string, unknown> | undefined;
    expect(el && 'stroke' in el).toBe(false);
  });
});
