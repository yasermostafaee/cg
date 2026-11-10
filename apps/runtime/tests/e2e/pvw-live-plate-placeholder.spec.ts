import type { Page } from '@playwright/test';
import type { Scene } from '@cg/shared-schema';
import {
  buildVcgIndexHtml,
  cgCss,
  cgJs,
  cgJsIife,
  ExporterSingleFile,
} from '@cg/single-file-export';
import { pack } from '@cg/vcg-format';
import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * R-049 — A LIVE PLATE IS VISIBLE IN PVW, AND SAYS WHICH SOURCE IS BEHIND IT.
 *
 * The reported defect, from the owner's live testing: in CG Control's PVW you
 * cannot tell a live plate exists at all. The rendered page paints ZERO PIXELS
 * where a Live Source is — correctly, and unchanged by this spec's subject
 * (`live-source-multibox` design.md §12.2) — so an empty region was
 * indistinguishable from a broken render, and nothing said which source was
 * bound to which plate.
 *
 * ── WHAT ONLY A REAL BROWSER CAN ANSWER, AND WHY THIS SPEC EXISTS ───────────
 *
 * The placement arithmetic is pinned in `tests/livePlateGeometry.test.ts`, over a
 * table of NON-16:9 rasters where the terms do not collapse; the two states are
 * pinned in `tests/livePlateOverlay.dom.test.ts`. Neither can answer the question
 * this spec is for: does the marker actually land ON the hole, measured against a
 * REAL laid-out page, through a REAL fit transform, with a real ResizeObserver
 * driving it? jsdom reports every box as zero, so the alignment claim is
 * unfalsifiable there — it is exactly the shape of assertion that goes green
 * while an operator looks at a marker floating in the wrong place.
 *
 * ── THE PAGE IS A STAND-IN, AND IT CARRIES THE HOLE AT THE DECLARED RECT ────
 *
 * The offline mock retains no rendered page, so PVW would show its "unavailable
 * in this browser" state and there would be no frame at all. The stand-in is a
 * TEST-ONLY override of one bridge method (the `rehearse-composite.spec.ts`
 * precedent), and it paints the holes' rects as MEASURABLE, invisible boxes at
 * exactly the coordinates the registered `TemplateInfo` declares. That is what
 * makes "the marker sits on the hole" a real comparison rather than a restatement
 * of the same numbers: the page positions its boxes by its own CSS, the overlay
 * positions its markers by the geometry chain, and the test compares the two
 * results in viewport pixels.
 */

/** `PLAYOUT-SOURCES-01` — the station's sources are the seeded Playout's inputs. */
test.use({ playoutSources: E2E_PLAYOUT });

const TWO_BOX = 'tpl-e2e-pvw-plates';

/** Where each hole sits, in the scene's own pixels. The page and the registry agree. */
const HOLES = {
  'guest-1': { x: 120, y: 140, width: 640, height: 360 },
  'guest-2': { x: 1000, y: 560, width: 480, height: 270 },
} as const;
type PlateRects = Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;

const PAN_HOLES = {
  portrait: { x: 200, y: 160, width: 350, height: 540 },
  wide: { x: 720, y: 590, width: 920, height: 260 },
} as const;

/**
 * A stand-in for the served self-contained page: a full-frame `.cg-stage` with a
 * transparent, zero-painting box at each declared hole.
 *
 * The boxes paint NOTHING (this is what the real export does), but they are laid
 * out, so `getBoundingClientRect()` reports where the page believes the hole is.
 */
function pageWithHoles(holes: PlateRects = HOLES): string {
  const boxes = Object.entries(holes)
    .map(
      ([id, r]) =>
        `<div data-hole="${id}" style="position:absolute;left:${String(r.x)}px;top:${String(r.y)}px;` +
        `width:${String(r.width)}px;height:${String(r.height)}px"></div>`,
    )
    .join('');
  // D-087's BLANK-UNTIL-PLAY contract, modelled the way the real runtime models
  // it: `body.cg-pending` hides the stage, `play()` clears it, `stop()` re-adds
  // it. The stand-in carries it because one of this spec's subjects is precisely
  // how the overlay behaves ACROSS that transition — a page that painted from
  // boot could not tell the two apart.
  return `<!doctype html><html><head>
<style>html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent}
.cg-stage{position:absolute;left:0;top:0;width:1920px;height:1080px}
body.cg-pending .cg-stage{visibility:hidden}
[data-painted]{position:absolute;left:40px;top:40px;width:200px;height:80px;background:#3355ff}</style>
</head><body class="cg-pending">
  <div class="cg-stage">${boxes}<div data-painted></div></div>
  <script>
    window.play=function(){document.body.classList.remove('cg-pending');};
    window.stop=function(){document.body.classList.add('cg-pending');};
    window.update=function(){};window.next=function(){};
  </script>
</body></html>`;
}

async function stubRetainedPage(page: Page, html = pageWithHoles()): Promise<void> {
  await page.evaluate((html: string) => {
    (
      window as unknown as { cg: { templates: { page: () => Promise<unknown> } } }
    ).cg.templates.page = () => Promise.resolve({ kind: 'page', html, source: 'bridge' });
  }, html);
}

/** Register a template declaring the two holes above, as an import would leave it. */
async function registerTwoBox(
  page: Page,
  holes: PlateRects = HOLES,
  cropEdges = false,
  expectedAspect?: number,
): Promise<void> {
  await page.evaluate(
    async ({ templateId, holes, cropEdges, expectedAspect }) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> };
        };
      };
      await w.cg.templates.import({
        template: {
          templateId,
          name: 'two-box',
          sourceFileName: 'two-box.vcg',
          templateType: 'lower-third',
          fields: [],
          liveSources: {
            resolution: { width: 1920, height: 1080 },
            // `PositionSchema`'s real shape — `offset: {x,y}`, NOT the `dx`/`dy`
            // of the query serialisation. The placeholder geometry resolves this
            // through the same `outputTranslate` the page runs, so a query-shaped
            // literal here would reach `position.offset.x` as `undefined`.
            defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
            sources: Object.entries(holes).map(([sourceId, rect], i) => ({
              elementId: `el-${String(i + 1)}`,
              sourceId,
              rect,
              dynamic: false,
              ...(cropEdges && { fitMode: 'cover' }),
              ...(expectedAspect !== undefined && { expectedAspect }),
            })),
          },
        },
        html: '<!doctype html><html><body>two-box</body></html>',
      });
    },
    { templateId: TWO_BOX, holes, cropEdges, expectedAspect },
  );
}

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

const marker = (page: Page, plateId: string) => page.locator(`[data-live-plate="${plateId}"]`);

/** The REHEARSAL's transport, not a stack row's — see the call site. */
const pvwTransport = (page: Page, verb: 'PLAY' | 'NEXT' | 'STOP') =>
  page
    .getByRole('region', { name: 'PREVIEW (PVW)' })
    .getByRole('button', { name: verb, exact: true });

/*
 * 🔴 `MONITORS-01` — THE STRIP IS FOLDED AWAY WHEN THE CONSOLE BOOTS, and this file's
 * subject lives inside it, so it is opened first.
 *
 * The default moved from SHOWN to HIDDEN because neither box was confidence monitoring:
 * PGM was then an empty placeholder for `C-016` (since built as the Playout's return, still off by default), and PVW is a LOCAL browser
 * render of the rehearsing rows (`R-022` — nothing is ever sent to CasparCG). None of
 * that changes what this file proves, so the state each test was written against is
 * established rather than its assertions being rewritten.
 *
 * `app.showMonitors()` asserts the strip is actually up before returning — see the
 * fixture. Boot state itself is proved in `shell-chrome.spec.ts` §B4.
 */
test.beforeEach(async ({ app }) => {
  await app.showMonitors();
});

test('D-178 — Pan stays in Preview and requires a visible Crop edges plate', async ({ app }) => {
  const { page } = app;
  const programme = page.getByRole('button', { name: 'Pan live input', exact: true });
  await expect(programme).toHaveCount(0);
  const preview = page.getByRole('button', { name: 'Pan preview input', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toBeDisabled();
  await expect(preview).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-pan-practice-picture]')).toHaveCount(0);

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();
  await expect(marker(page, 'guest-1')).toBeVisible();
  await expect(preview).toBeDisabled();
  await expect(page.locator('[data-pan-practice-picture]')).toHaveCount(0);
});

test('D-178 — practice keeps the full source and each plate aspect across both crop axes', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  await registerTwoBox(page, PAN_HOLES, true);
  await stubRetainedPage(page, pageWithHoles(PAN_HOLES));
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);
  const preview = page.getByRole('button', { name: 'Pan preview input', exact: true });
  await expect(preview).toBeDisabled();
  await pvwTransport(page, 'PLAY').click();
  await expect(preview).toBeEnabled();
  await preview.click();
  await expect(preview).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toHaveClass(/\bis-on\b/);
  const airCount = page.locator('[data-monitor-air-count]');
  const initialAirCount = await airCount.innerText();

  for (const [plateId, axis] of [
    ['portrait', 'horizontal'],
    ['wide', 'vertical'],
  ] as const) {
    const practice = page.getByRole('button', {
      name: `Pan practice image in ${plateId}`,
      exact: true,
    });
    const picture = practice.locator('[data-pan-practice-picture]');
    const crop = practice.locator('[data-pan-practice-crop]');
    await expect(crop).toHaveCSS('border-top-width', '3px');
    await expect(practice).toHaveAttribute('data-pan-practice-axis', axis);
    const [plate, full, window] = await Promise.all([
      marker(page, plateId).boundingBox(),
      picture.boundingBox(),
      crop.boundingBox(),
    ]);
    if (plate === null || full === null || window === null)
      throw new Error('Missing practice geometry');
    expect(await practice.boundingBox()).toEqual(plate);
    expect(full.width / full.height).toBeCloseTo(16 / 9, 2);
    expect(window.width / window.height).toBeCloseTo(plate.width / plate.height, 2);

    const x = window.x + window.width / 2;
    const y = window.y + window.height / 2;
    const shiftX = axis === 'horizontal' ? (full.width - window.width) / 4 : full.width / 4;
    const shiftY = axis === 'vertical' ? (full.height - window.height) / 4 : full.height / 4;
    const activeKey = axis === 'horizontal' ? 'x' : 'y';
    const fixedKey = axis === 'horizontal' ? 'y' : 'x';
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + shiftX, y + shiftY);
    await expect
      .poll(async () => (await crop.boundingBox())?.[activeKey])
      .toBeGreaterThan(window[activeKey] + 1);
    await page.mouse.up();
    const moved = await crop.boundingBox();
    expect(moved?.[fixedKey]).toBeCloseTo(window[fixedKey], 2);
    expect(moved?.width).toBeCloseTo(window.width, 2);
    expect(moved?.height).toBeCloseTo(window.height, 2);
    expect(await picture.boundingBox()).toEqual(full);

    const center = practice
      .locator('..')
      .getByRole('button', { name: 'Center preview crop', exact: true });
    const centerBox = await center.boundingBox();
    expect(centerBox?.height).toBeGreaterThanOrEqual(23.9);
    expect(centerBox?.width).toBeGreaterThanOrEqual(28);
    await center.click();
    await expect
      .poll(async () => (await crop.boundingBox())?.[activeKey])
      .toBeCloseTo(window[activeKey], 2);
  }
  await expect(airCount).toHaveText(initialAirCount);
  await preview.click();
  await expect(preview).toHaveAttribute('aria-pressed', 'false');
  await expect(preview).not.toHaveClass(/\bis-on\b/);
  await expect(page.locator('[data-pan-practice-picture]')).toHaveCount(0);
  await preview.click();
  await pvwTransport(page, 'STOP').click();
  await expect(preview).toBeDisabled();
  await expect(page.locator('[data-pan-practice-picture]')).toHaveCount(0);
  await pvwTransport(page, 'PLAY').click();
  await expect(preview).toBeEnabled();
  await expect(preview).toHaveAttribute('aria-pressed', 'false');
});

test('D-178 — practice crop Draft and Update survive OFF PVW and ON PVW', async ({ app }) => {
  const { page } = app;
  await registerTwoBox(page, PAN_HOLES, true);
  await stubRetainedPage(page, pageWithHoles(PAN_HOLES));
  const layer = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(layer);
  const pan = page.getByRole('button', { name: 'Pan preview input', exact: true });
  const plate = page.getByRole('button', { name: 'Pan practice image in portrait', exact: true });
  const crop = plate.locator('[data-pan-practice-crop]');
  const readLeft = () => crop.evaluate((element) => element.style.left);
  const enter = async () => {
    await rehearseRow(page, layer);
    await pvwTransport(page, 'PLAY').click();
    await pan.click();
    await expect(plate).toBeVisible();
  };
  const leave = () =>
    page
      .locator(`[data-layer="${String(layer)}"]`)
      .getByRole('button', { name: 'OFF PVW', exact: true })
      .click();
  await enter();
  const centered = await readLeft();
  await plate.press('ArrowRight');
  await expect.poll(readLeft).not.toBe(centered);
  const moved = await readLeft();
  await expect(page.locator('[data-pan-crop-state="practice-draft"]')).toHaveCount(1);
  await leave();
  await enter();
  await expect.poll(readLeft).toBe(moved);
  await app.inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect(page.locator('[data-pan-crop-state="practice-saved"]')).toHaveCount(1);
  await leave();
  await enter();
  await expect.poll(readLeft).toBe(moved);
  await expect(page.locator('[data-pan-crop-state="practice-saved"]')).toHaveCount(1);
});

test('D-178 — corner resize preserves a matching-aspect plate and is saved through Update', async ({
  app,
}) => {
  const { page } = app;
  await page.setViewportSize({ width: 1600, height: 900 });
  await registerTwoBox(page, HOLES, true);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(layer);
  await app.setTemplateDefault('guest-1', 'Studio 1');
  await page.evaluate(() => {
    const token = 'd'.repeat(64);
    let saved: { x: number; y: number; zoom?: number | undefined } = { x: 0.5, y: 0.5 };
    window.cg.stack.previewPlateCrop = async ({ edits }) => {
      if (edits?.[0]?.token === token) {
        saved = edits[0].focus;
        Object.assign(window, { resizedCropSaved: saved });
      }
      return {
        ok: true,
        targets: [
          {
            plateId: 'guest-1',
            token,
            sourceAspect: 16 / 9,
            resizable: true,
            focus: saved,
            staged: saved.zoom !== undefined,
          },
        ],
        ...(edits !== undefined && { applied: [token] }),
      };
    };
  });
  const row = page.locator(`[data-layer="${String(layer)}"]`);
  const pan = page.getByRole('button', { name: 'Pan preview input', exact: true });
  const handle = page.getByRole('button', { name: 'Pan crop guide in guest-1', exact: true });
  const crop = handle.locator('[data-pan-practice-crop]');
  const corner = page.getByRole('button', {
    name: 'Resize bottom right crop corner in guest-1',
    exact: true,
  });
  const enter = async (): Promise<void> => {
    await rehearseRow(page, layer);
    await pvwTransport(page, 'PLAY').click();
    await pan.click();
    await expect(corner).toBeVisible();
  };
  await enter();
  const original = await crop.boundingBox();
  const grip = await corner.boundingBox();
  if (original === null || grip === null) throw new Error('Missing crop and corner geometry');
  await expect(handle).not.toHaveAttribute('data-pan-practice-axis');
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - original.width / 4, y - original.height / 4);
  await page.mouse.up();
  const resized = await crop.boundingBox();
  if (resized === null) throw new Error('Missing resized crop');
  expect(resized.width / original.width).toBeCloseTo(0.75, 1);
  expect(resized.width / resized.height).toBeCloseTo(16 / 9, 2);
  expect(resized.x).toBeCloseTo(original.x, 1);
  expect(resized.y).toBeCloseTo(original.y, 1);
  await expect(handle).toHaveAttribute('data-pan-practice-axis', 'both');
  await expect(handle.locator('..')).toHaveAttribute('data-pan-crop-state', 'draft');

  await handle.locator('..').getByRole('button', { name: 'Center preview crop' }).click();
  const centered = await crop.boundingBox();
  expect(centered?.width).toBeCloseTo(resized.width, 1);
  expect(centered?.x).toBeGreaterThan(resized.x);
  await row.getByRole('button', { name: 'OFF PVW', exact: true }).click();
  await app.inspector.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  const saved = await page.evaluate(
    () =>
      (window as typeof window & { resizedCropSaved?: { x: number; y: number; zoom?: number } })
        .resizedCropSaved,
  );
  expect(saved).toMatchObject({ x: 0.5, y: 0.5 });
  expect(saved?.zoom).toBeCloseTo(4 / 3, 1);
  await enter();
  await expect(handle.locator('..')).toHaveAttribute('data-pan-crop-state', 'saved');
  expect((await crop.boundingBox())?.width).toBeCloseTo(resized.width, 1);
  await expect(row.getByRole('button', { name: 'OFF PVW', exact: true })).toBeVisible();
});

test('D-178 / B-426 — measured JPEG crop uses the assigned aspect and cancels only stale gestures', async ({
  app,
}) => {
  const { page } = app;
  await registerTwoBox(page, PAN_HOLES, true, 4 / 3);
  await stubRetainedPage(page, pageWithHoles(PAN_HOLES));
  const layer = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(layer);
  await app.setTemplateDefault('portrait', 'Studio 1');
  await page.evaluate(() => {
    function sourceImage(color: string): string {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 160, 160);
      ctx.fillStyle = color;
      ctx.fillRect(0, 35, 160, 90);
      return canvas.toDataURL('image/jpeg').split(',')[1]!;
    }
    const state = {
      sourceId: '',
      index: 0,
      sourceAspect: 16 / 9,
      revision: 'a'.repeat(64),
      jpegs: [sourceImage('#FF0000'), sourceImage('#00FF00')],
    };
    Object.assign(window, { measuredPan: state });
    Object.assign(window.cg, {
      sourcePreviews: {
        pvw: async ({ sourceIds }: { sourceIds: string[] }) => {
          state.sourceId = sourceIds[0] ?? state.sourceId;
          return {
            frames: sourceIds.map((sourceId) => ({
              sourceId,
              signal: 'present',
              jpegBase64: state.jpegs[state.index],
              width: 160,
              height: 160,
              geometry: {
                sourceAspect: state.sourceAspect,
                revision: state.revision,
                activeRect: { x: 0, y: 35 / 160, width: 1, height: 90 / 160 },
              },
            })),
          };
        },
      },
    });
    window.cg.stack.previewPlateCrop = async () => ({
      ok: true,
      targets: [
        {
          plateId: 'portrait',
          sourceId: state.sourceId,
          token: 'b'.repeat(64),
          sourceAspect: 16 / 9,
          focus: { x: 0.5, y: 0.5 },
        },
      ],
    });
  });
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();
  await page.waitForFunction(() =>
    Boolean((window as unknown as { measuredPan: { sourceId: string } }).measuredPan.sourceId),
  );
  await page.getByRole('button', { name: 'Pan preview input', exact: true }).click();
  const handle = page.getByRole('button', { name: 'Pan source picture in portrait', exact: true });
  const picture = handle.locator('[data-pan-source-revision]');
  await expect(picture).toBeVisible();
  await expect(picture).toHaveCSS('background-size', '350px 350px');
  await expect(picture).toHaveCSS('background-position', '0px -76.5625px');
  const original = await picture.evaluate((el) => {
    el.dataset['probe'] = 'same-gesture';
    return el.style.backgroundImage;
  });
  await page.evaluate(() => {
    (window as unknown as { measuredPan: { index: number } }).measuredPan.index = 1;
  });
  await expect.poll(() => picture.evaluate((el) => el.style.backgroundImage)).not.toBe(original);
  await expect(picture).toHaveAttribute('data-probe', 'same-gesture');

  const rect = await picture.boundingBox();
  if (rect === null) throw new Error('The source picture is missing');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height / 2);
  await page.evaluate(() => {
    (window as unknown as { measuredPan: { revision: string } }).measuredPan.revision = 'c'.repeat(
      64,
    );
  });
  await expect(picture).toHaveAttribute('data-pan-source-revision', 'c'.repeat(64));
  await page.mouse.up();
  await expect(page.locator('[data-pan-crop-state="draft"]')).toHaveCount(0);
  await handle.press('ArrowRight');
  await expect(page.locator('[data-pan-crop-state="draft"]')).toHaveCount(1);

  await page.evaluate(() => {
    (window as unknown as { measuredPan: { sourceAspect: number } }).measuredPan.sourceAspect =
      4 / 3;
  });
  await expect(handle).toHaveCount(0);
  const bars = page.getByRole('button', { name: 'Pan crop guide in portrait', exact: true });
  await expect(bars.locator('[data-pan-practice-picture]')).toHaveCSS(
    'background-image',
    /linear-gradient/,
  );
  await expect(page.locator('[data-pan-crop-state="draft"]')).toHaveCount(1);
});

test('B-424 — PVW keeps the authored fallback when on-air fallback is off', async ({ app }) => {
  const date = '2026-11-09T00:00:00.000Z';
  const scene: Scene = {
    schemaVersion: 1,
    id: 'pvw-authored-fallback',
    name: 'Authored plate fallback',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    editorBackdrop: 'transparent',
    frameRange: { in: 0, out: 50 },
    safeAreas: { title: 10, action: 5 },
    layers: [
      {
        id: 'plates',
        name: 'Plates',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: Object.entries(HOLES).map(([routeKey, rect], index) => ({
          id: `el-${routeKey}`,
          name: routeKey,
          type: 'video-placeholder',
          routeKey,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: index,
          transform: {
            position: { x: rect.x, y: rect.y },
            size: { w: rect.width, h: rect.height },
            anchor: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
          },
          ...(index === 0
            ? {
                fallbackKind: 'color',
                fallbackColor: '#21405F',
                fitMode: 'cover',
                showFallback: false,
              }
            : { fallbackKind: 'bars' }),
        })),
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: date, updatedAt: date },
  };
  const vcg = await pack({
    scene,
    manifestExtras: {
      id: scene.id,
      name: scene.name,
      fontDeps: [],
      assetIndex: [],
      authoring: { designerVersion: '1.0.0', createdAt: date, exportedAt: date },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    },
    indexHtml: buildVcgIndexHtml(scene, [], [], false),
    cgJs,
    cgCss,
  });
  const page = app.page;
  const layer = await app.importVcg('plate-fallback.vcg', vcg, 59);
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  const solidFallback = '[data-cg-live-fallback="el-guest-1"]';
  const barsFallback = '[data-cg-live-fallback="el-guest-2"]';
  const air = await page.context().newPage();
  try {
    await air.setContent(html);
    await air.waitForFunction(
      () => typeof (window as unknown as { play?: unknown }).play === 'function',
    );
    await air.evaluate(() => (window as unknown as { play: () => void }).play());
    await expect(air.locator(barsFallback)).toBeVisible();
    await expect(air.locator(solidFallback)).toBeHidden();
  } finally {
    await air.close();
  }
  await stubRetainedPage(page, html);
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();

  const frame = page.frameLocator('iframe[data-rehearsal-frame]');
  const solid = frame.locator(solidFallback);
  await expect(solid).toBeVisible();
  await expect(solid).toHaveCSS('background-color', 'rgb(33, 64, 95)');
  await expect(frame.locator(barsFallback)).toHaveCSS('background-image', /linear-gradient/);
  for (const id of Object.keys(HOLES)) {
    await expect(marker(page, id)).toHaveCSS('background-image', 'none');
    await expect(marker(page, id)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  const cropLabel = marker(page, 'guest-1').getByText('Crop edges', { exact: true });
  await expect(cropLabel).toBeVisible();
  await expect(cropLabel).toHaveCSS('color', 'rgb(132, 235, 233)');
  await expect(marker(page, 'guest-2').getByText('Crop edges', { exact: true })).toHaveCount(0);

  const coverPlate = await marker(page, 'guest-1').boundingBox();
  await page.getByRole('button', { name: 'Pan preview input', exact: true }).click();
  const coverPractice = page.getByRole('button', { name: 'Pan practice image in guest-1' });
  await expect(coverPractice).toBeVisible();
  expect(await coverPractice.boundingBox()).toEqual(coverPlate);
  await expect(page.getByRole('button', { name: 'Pan practice image in guest-2' })).toHaveCount(0);
});

test('PVW marks every live plate, and the marker lands ON the hole', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();

  // THE DEFECT: nothing at all used to be visible here.
  await expect(page.locator('[data-live-plate]')).toHaveCount(2);

  // ── ALIGNMENT, measured in VIEWPORT pixels on both sides ─────────────────
  //
  // The page's own laid-out box for each hole, versus the overlay's marker for
  // the same plate. Two independent routes to one answer: the page applies its
  // CSS inside a raster-sized iframe that is then fit-scaled; the overlay applies
  // the scene-px → raster-px chain inside a box carrying the SAME fit transform.
  // If a second scale factor were ever derived beside the stage's own, this is
  // what would catch it.
  for (const plateId of Object.keys(HOLES)) {
    const hole = await page
      .frameLocator('iframe[data-rehearsal-frame]')
      .locator(`[data-hole="${plateId}"]`)
      .boundingBox();
    const box = await marker(page, plateId).boundingBox();
    expect(hole).not.toBeNull();
    expect(box).not.toBeNull();
    if (hole === null || box === null) throw new Error('unreachable');
    // Sub-pixel tolerance only: these are the same transform applied twice, so
    // anything beyond rounding is a real divergence. A loose tolerance here would
    // pass through exactly the drift the test exists to find.
    expect(Math.abs(box.x - hole.x)).toBeLessThan(1.5);
    expect(Math.abs(box.y - hole.y)).toBeLessThan(1.5);
    expect(Math.abs(box.width - hole.width)).toBeLessThan(1.5);
    expect(Math.abs(box.height - hole.height)).toBeLessThan(1.5);
  }

  // ── AND IT SURVIVES A RESIZE, which is when a second scale would show ────
  await page.setViewportSize({ width: 1100, height: 780 });
  await expect
    .poll(async () => {
      const hole = await page
        .frameLocator('iframe[data-rehearsal-frame]')
        .locator('[data-hole="guest-1"]')
        .boundingBox();
      const box = await marker(page, 'guest-1').boundingBox();
      if (hole === null || box === null) return 99;
      return Math.max(Math.abs(box.x - hole.x), Math.abs(box.y - hole.y));
    })
    .toBeLessThan(1.5);
});

test('PVW composites distinct source snapshots under authored shapes and inside a plate mask', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const date = '2026-11-10T00:00:00.000Z';
  const transform = (x: number, y: number, w: number, h: number) => ({
    position: { x, y },
    size: { w, h },
    anchor: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
  });
  const base = { visible: true, locked: false, opacity: 1 };
  const scene: Scene = {
    schemaVersion: 1,
    id: 'pvw-source-pictures',
    name: 'Source pictures',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    editorBackdrop: 'transparent',
    frameRange: { in: 0, out: 50 },
    safeAreas: { title: 10, action: 5 },
    layers: [
      {
        id: 'plates',
        name: 'Plates',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          ...Object.entries(HOLES).map(([routeKey, rect], zIndex) => ({
            ...base,
            id: routeKey,
            name: routeKey,
            type: 'video-placeholder' as const,
            routeKey,
            zIndex,
            transform: transform(rect.x, rect.y, rect.width, rect.height),
            fallbackKind: 'color' as const,
            fallbackColor: '#FF0044',
            ...(zIndex === 0 && {
              liveMask: { mode: 'inside' as const, rects: [{ x: 0, y: 0, width: 0.5, height: 1 }] },
            }),
          })),
          {
            ...base,
            id: 'foreground',
            name: 'Foreground shape',
            type: 'shape',
            shape: 'rect',
            zIndex: 2,
            transform: transform(190, 190, 90, 60),
            fill: { kind: 'solid', color: '#FFFF00' },
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: date, updatedAt: date },
  };
  const vcg = await pack({
    scene,
    manifestExtras: {
      id: scene.id,
      name: scene.name,
      fontDeps: [],
      assetIndex: [],
      authoring: { designerVersion: '1.0.0', createdAt: date, exportedAt: date },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    },
    indexHtml: buildVcgIndexHtml(scene, [], [], false),
    cgJs,
    cgCss,
  });
  const layer = await app.importVcg('source-pictures.vcg', vcg, 59);
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  await stubRetainedPage(page, html);
  await app.selectLayerRow(layer);
  await app.setTemplateDefault('guest-1', 'Studio 1');
  await app.setTemplateDefault('guest-2', 'Studio 2');
  await page.evaluate(() => {
    const jpeg = (color: string): string => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg').split(',')[1]!;
    };
    const green = jpeg('#00FF00');
    const blue = jpeg('#0000FF');
    const state = {
      lost: false,
      requests: [] as { channel: number; viewId: string; sourceIds: string[] }[],
    };
    Object.assign(window, { pvwSourceTest: state });
    Object.assign(window.cg, {
      sourcePreviews: {
        pvw: async (request: (typeof state.requests)[number]) => {
          state.requests.push(request);
          return {
            frames: request.sourceIds.map((sourceId) => {
              const studioOne = sourceId.endsWith('studio-1');
              if (studioOne && state.lost) return { sourceId, signal: 'absent' };
              return {
                sourceId,
                signal: 'present',
                jpegBase64: studioOne ? green : blue,
                width: 160,
                height: 90,
              };
            }),
          };
        },
      },
    });
  });
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();
  const frame = page.frameLocator('iframe[data-rehearsal-frame]');
  const plate = (id: string) => frame.locator(`[data-cg-live-source="${id}"]`);
  const sourcePicture = (id: string) => plate(id).locator('[data-cg-pvw-picture-part] img');
  await expect(sourcePicture('guest-1')).toHaveJSProperty('naturalWidth', 160);
  await expect(sourcePicture('guest-2')).toHaveJSProperty('naturalWidth', 160);
  const a = await plate('guest-1').boundingBox();
  const b = await plate('guest-2').boundingBox();
  if (a === null || b === null) throw new Error('Live plates are missing');
  const colors = await page.evaluate(
    async ({ screenshot, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${screenshot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return points.map(([x, y]) => Array.from(ctx.getImageData(x!, y!, 1, 1).data));
    },
    {
      screenshot: (await page.screenshot()).toString('base64'),
      points: [
        [a.x + a.width * 0.1, a.y + a.height * 0.65],
        [a.x + a.width * 0.18, a.y + a.height * 0.2],
        [a.x + a.width * 0.7, a.y + a.height * 0.65],
        [b.x + b.width * 0.1, b.y + b.height * 0.65],
      ],
    },
  );
  expect(colors[0]?.[1]).toBeGreaterThan(240);
  expect(colors[0]?.[0]).toBeLessThan(20);
  expect(colors[1]?.slice(0, 3)).toEqual([255, 255, 0]);
  expect(colors[2]?.[1]).toBeLessThan(160);
  expect(colors[3]?.[2]).toBeGreaterThan(240);
  expect(colors[3]?.[1]).toBeLessThan(20);
  await page.evaluate(() => {
    (window as unknown as { pvwSourceTest: { lost: boolean } }).pvwSourceTest.lost = true;
  });
  await expect(sourcePicture('guest-1')).toHaveCount(0);
  await expect(marker(page, 'guest-1').getByText('No signal')).toBeVisible();
  await expect(sourcePicture('guest-2')).toHaveJSProperty('naturalWidth', 160);
  await app.setTemplateDefault('guest-1', 'Studio 2');
  await expect(plate('guest-1').locator('[data-cg-pvw-picture-part]')).toHaveAttribute(
    'data-source-id',
    /studio-2$/,
  );
  await expect(sourcePicture('guest-1')).toHaveJSProperty('naturalWidth', 160);
  await pvwTransport(page, 'STOP').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { requests } = (
          window as unknown as {
            pvwSourceTest: {
              requests: { channel: number; viewId: string; sourceIds: string[] }[];
            };
          }
        ).pvwSourceTest;
        return (
          requests[0]?.sourceIds.length === 2 &&
          requests.at(-1)?.sourceIds.length === 0 &&
          requests.some((r) => r.sourceIds.length === 1 && r.sourceIds[0]?.endsWith('studio-2')) &&
          requests.every(
            (r) => r.channel === requests[0]?.channel && r.viewId === requests[0]?.viewId,
          )
        );
      }),
    )
    .toBe(true);
});

test('the two plate states are told apart WITHOUT reading the label', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();

  // With nothing bound, BOTH plates are the unassigned state — and they say so.
  await expect(page.locator('[data-live-plate-state="unassigned"]')).toHaveCount(2);
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');
  /*
    Every marker declares itself, in both states: an operator must never be able to believe
    PVW is showing the real picture.

    🔴 SUPERSEDED IN FORM BY `CONSOLE-LOOK-06` DELTA D6, not in substance. This used to read
    `toContainText('PLACEHOLDER')` on the marker itself. These two plates render 97 px and
    73 px wide against a label that is a fixed 156.8 px, so the words were being CLIPPED to a
    fragment — and the owner's ruling names the fallback: they move to the stamp's own line,
    permanent and still on canvas. So the claim is asserted where it now holds, and the
    marker keeps the half that always fits: its accessible name.
  */
  await expect(page.locator('[data-live-source-note]')).toHaveText('LIVE SOURCES NOT RENDERED');
  await expect(marker(page, 'guest-1')).toHaveAttribute('aria-label', /preview placeholder/i);

  // BIND one plate to a Playout input through the Inspector. (`PLAYOUT-SOURCES-01` — the inputs
  // are the seeded Playout's; nothing in the console defines one any more.)
  await app.selectLayerRow(layer);

  /*
    🔴 **UNASSIGNED IS UNASSIGNED, AND PVW SAYS SO.** A take of this plate would be REFUSED
    (`live-source-unassigned`); showing it as bound would tell the operator the take will work
    at the exact moment it will not — the failure PVW is their last chance to catch.

    ⚠ **THE `STAGED` HALF OF THIS CASE IS GONE, and that is a behaviour change rather than a
    weaker test.** It used to assert that an edit STAGED in the Inspector did not show here,
    because the assignment only landed on the row's UPDATE. `SOURCE-DEFAULTS-20` gave the
    defaults their own dialog with its own commit, so there is no staged-but-unwritten state
    left to assert — the dialog's `Save` IS the assignment, and its `Cancel` writes nothing
    (asserted in `live-source-sources.spec.ts`). What survives is the claim that matters to
    this surface: unassigned reads as unassigned, assigned names its source.
  */
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');
  await expect(marker(page, 'guest-1')).toHaveAttribute('data-live-plate-state', 'unassigned');

  await app.setTemplateDefault('guest-1', 'Studio 1');

  // Assigned: the plate flips state and names the Playout input's NAME — the join
  // no exported page can make, because it carries a plate identifier and nothing
  // else.
  await expect(marker(page, 'guest-1')).toHaveAttribute('data-live-plate-state', 'assigned');
  await expect(marker(page, 'guest-1')).toContainText('Studio 1');
  await expect(marker(page, 'guest-2')).toHaveAttribute('data-live-plate-state', 'unassigned');

  // ── THE ACROSS-THE-ROOM DIFFERENCE, asserted on COMPUTED STYLE ───────────
  // The requirement is that the states are separable before a word is read, so
  // the assertion is about what is painted, not about what is written. A test
  // that only compared the text would pass against two identical-looking boxes.
  const borders = await Promise.all(
    ['guest-1', 'guest-2'].map((id) =>
      marker(page, id).evaluate((el) => getComputedStyle(el).borderTopColor),
    ),
  );
  expect(borders[0]).not.toBe(borders[1]);
});

/** R-106 — the template and its Runtime-owned marker share one local lifecycle. */
test('the marker is hidden before Play, survives Next, and hides with Stop', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);

  const stage = page.frameLocator('iframe[data-rehearsal-frame]').locator('.cg-stage');
  const painted = page.frameLocator('iframe[data-rehearsal-frame]').locator('[data-painted]');

  // ── BEFORE PLAY ──────────────────────────────────────────────────────────
  await expect(painted).toBeHidden();
  await expect(marker(page, 'guest-1')).toHaveCount(0);

  // ── DURING PLAY ──────────────────────────────────────────────────────────
  // Scoped to the PVW REGION: every stack row carries a PLAY of its own, and
  // those drive AIR. The transport under test is the rehearsal's, which runs the
  // lifecycle locally and sends nothing to CasparCG.
  await pvwTransport(page, 'PLAY').click();
  await expect(painted).toBeVisible();
  await expect(marker(page, 'guest-1')).toBeVisible();
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');
  await expect(marker(page, 'guest-1')).toHaveAttribute('data-live-plate-state', 'unassigned');

  // NEXT advances the page but is not a visibility transition.
  await pvwTransport(page, 'NEXT').click();
  await expect(painted).toBeVisible();
  await expect(marker(page, 'guest-1')).toBeVisible();

  // ── AFTER STOP ───────────────────────────────────────────────────────────
  await pvwTransport(page, 'STOP').click();
  await expect(painted).toBeHidden();
  await expect(marker(page, 'guest-1')).toHaveCount(0);
  // The stage element itself is never removed by any of this — the frame is the
  // page's, and nothing here reaches into it.
  await expect(stage).toHaveCount(1);
});

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA D6 — `R-022`'s TWO CAVEATS ARE TWO PERMANENT MARKS ON CANVAS.
 *
 * The owner's ruling after `CONSOLE-LOOK-06`'s report, which had recorded `R-022` as PARTLY
 * MET with both caveats riding a `title`: "a hover is not where they live. Put each caveat at
 * the thing it describes, permanently."
 *
 *   1. The local stage's accessible description names the limits of the preview.
 *   2. The region's own chip identifies the live-source placeholder,
 *      which has been on canvas since `add-multibox-audio`: `LIVE SOURCE · PLACEHOLDER`,
 *      uppercase, tracked, muted, unmistakably chrome. The stamp cannot say this one, because
 *      the stamp describes the whole picture and this is about one region inside it.
 *
 * What D6 ADDED is the accessible half: the long sentence on the region, so the visible label
 * is the short form and the accessible name is the long one — both, not either.
 *
 * ⭐ The reason a hover was refused is `R-028`'s: a hover serves the moment the console IS
 * helping, and deciding whether to trust the PVW picture is exactly the moment it is not.
 */
test('D6 — each live-source region states the caveat permanently, on canvas AND in its accessible name', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);
  await pvwTransport(page, 'PLAY').click();

  const regions = page.locator('[data-live-plate]');
  await expect(regions.first()).toBeVisible();
  const count = await regions.count();
  expect(count).toBeGreaterThan(0);

  /*
    🔴 THE ACCESSIBLE HALF IS UNCONDITIONAL — every region, at every size, carries the full
    sentence. This is the half D6 added, and it is the half that must never degrade.
  */
  for (let i = 0; i < count; i += 1) {
    const label = (await regions.nth(i).getAttribute('aria-label')) ?? '';
    expect(label, 'the region says it is a placeholder').toMatch(/preview placeholder/i);
    expect(label, 'the region directs the operator to the live output').toMatch(
      /server output for live video/i,
    );
  }

  /*
    🔴 AND THE VISIBLE HALF IS ALWAYS SOMEWHERE ON CANVAS — on the region when it fits, on the
    stamp when it does not, and NEVER on a hover. That is the whole invariant, so it is what
    is asserted, per region, rather than "the label is present" (which the two-box seed would
    fail honestly) or "the label is absent" (which would pass on a broken large region).

    Measured on this seed at 1600 × 900: its two plates render 97.2 px and 72.9 px wide
    against a label that is a fixed 156.8 px, so BOTH degrade here and the stamp says so.
  */
  const note = page.locator('[data-live-source-note]');
  let degraded = 0;
  for (let i = 0; i < count; i += 1) {
    const region = regions.nth(i);
    const box = await region.boundingBox();
    expect(box).not.toBeNull();
    const caveat = region.locator('[data-live-plate-caveat]');
    if ((await caveat.count()) === 1) {
      // It fits: the words are on the region, inside its own box, so a reader can tell WHICH
      // rect is a placeholder when there are several.
      await expect(caveat).toContainText('LIVE SOURCE · PLACEHOLDER');
      const c = await caveat.boundingBox();
      expect(c).not.toBeNull();
      expect(
        c!.width,
        'a rendered caveat that does not fit is a clipped caveat',
      ).toBeLessThanOrEqual(box!.width + 1);
    } else {
      degraded += 1;
    }
  }

  if (degraded > 0) {
    // The ONE allowed fallback: the stamp's own line. Permanent, on canvas, never a title.
    await expect(note).toHaveText('LIVE SOURCES NOT RENDERED');
  } else {
    await expect(note).toHaveCount(0);
  }
  // …and it is never a hover in either branch: there is no disclosure control to press.
  await expect(page.getByRole('button', { name: /rehearsal does not prove/i })).toHaveCount(0);

  await expect(page.getByText('ILLUSTRATIVE COMPOSITE · LOCAL', { exact: false })).toHaveCount(0);
});
