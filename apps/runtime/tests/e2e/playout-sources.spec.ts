import type { Locator, Page } from '@playwright/test';
import { FRAME_A, FRAME_B } from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';
import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A / §4 — **THE SOURCE PICKER, IN A REAL ENGINE.**
 *
 * `sourcePicker.dom.test.ts` pins the picker's rules in jsdom: what is listed, what is disabled and
 * why, the keyboard, a choice returned once. It cannot answer what this file is for, because jsdom
 * has no layout (golden rule 12c) and its virtualised list therefore scrolls nothing:
 *
 *   1. a large source library shows larger pictures inside the viewport, and its keyboard
 *      interaction stays in the top dialog until it closes;
 *   2. the Media list, scrolled for real, PAGES through the whole library — every item once, never
 *      audio — while the Playout does the searching (Persian normalisation included);
 *   3. inputs and media NEVER MEET, and no address reaches the page;
 *   4. the owner's take: one plate on an input, one on a media item — it plays, and Plate inputs
 *      name both with their own icons.
 *
 * Against the offline MockRuntime seeded with the fake Playout's list (`E2E_PLAYOUT`), whose
 * catalogue the bridge's own builder makes. Windows runs are NON-authoritative (golden rule 12a).
 */

test.use({ playoutSources: E2E_PLAYOUT });

const TPL = 'tpl-e2e-picker';

/** Two plates, one look placing both — the shape Plate inputs exists for. */
async function registerTemplate(page: Page): Promise<void> {
  await page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    const left = { x: 0, y: 0, width: 960, height: 540 };
    const right = { x: 960, y: 0, width: 960, height: 540 };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'picker',
        sourceFileName: 'picker.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [
            { elementId: 'el-1', sourceId: 'l-1', rect: left, dynamic: false },
            { elementId: 'el-2', sourceId: 'l-2', rect: right, dynamic: false },
          ],
          looks: [
            {
              id: 'two',
              name: '2-box',
              entered: { mode: 'cut' },
              rects: { 'l-1': left, 'l-2': right },
            },
          ],
          defaultLookId: 'two',
        },
      },
      html: '<!doctype html><html><body>picker</body></html>',
    });
  }, TPL);
}

/** Load the template onto a row, select it, and open its source defaults. */
async function openDefaults(app: {
  page: Page;
  inspector: Locator;
  loadTemplate: (id: string) => Promise<number>;
  selectLayerRow: (layer: number) => Promise<void>;
}): Promise<Locator> {
  await registerTemplate(app.page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);
  await app.inspector.locator('[data-open-template-defaults]').click();
  const dialog = app.page.getByRole('dialog', { name: 'Source defaults' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const picker = (page: Page): Locator => page.getByRole('dialog', { name: 'Choose a source' });

test('the large source picker shows larger pictures and restores the parent dialog focus', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  const dialog = await openDefaults(app);
  const field = dialog.locator('[data-defaults-select="l-1"]');

  await field.click();
  const panel = picker(page);
  const inputs = panel.locator('[data-picker-tab="inputs"]');
  const gridView = inputs.getByRole('button', { name: 'Grid view', exact: true });
  const listView = inputs.getByRole('button', { name: 'List view', exact: true });
  await expect(panel).toBeVisible();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog).toBeVisible();
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  const panelBox = await panel.boundingBox();
  if (panelBox === null) throw new Error('the picker must have a box');
  expect(panelBox.width).toBeGreaterThanOrEqual(800);
  expect(panelBox.height).toBeGreaterThanOrEqual(500);
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.y).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(1280);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(900);

  // The tabs carry their counts: the Playout's seven inputs, and its 124 video items (never audio).
  await expect(panel.getByRole('tab', { name: 'Inputs 7' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Media 124' })).toBeVisible();
  await expect(inputs).toHaveAttribute('data-input-view', 'grid');
  await expect(gridView).toHaveAttribute('aria-pressed', 'true');
  await expect(listView).toHaveAttribute('aria-pressed', 'false');

  const cards = inputs.locator('.cg-vlist-action-row');
  const card = cards.first();
  const thumbnail = await card.locator('[data-input-thumbnail]').boundingBox();
  if (thumbnail === null) throw new Error('the first input must have a visible picture slot');
  expect(thumbnail.width).toBeGreaterThanOrEqual(112);
  expect(thumbnail.width / thumbnail.height).toBeCloseTo(16 / 9, 1);
  const title = await card.locator('.cg-picker-row__name').boundingBox();
  if (title === null) throw new Error('the first input must have a visible title');
  expect(title.y).toBeGreaterThanOrEqual(thumbnail.y + thumbnail.height);
  const meter = await card.locator('[data-source-audio-meter]').boundingBox();
  if (meter === null) throw new Error('the first input must have a visible meter');
  expect(Math.abs(meter.x - (thumbnail.x + thumbnail.width))).toBeLessThanOrEqual(2);
  expect(meter.y).toBeCloseTo(thumbnail.y, 0);
  expect(meter.height).toBeCloseTo(thumbnail.height, 0);

  const position = (index: number) =>
    cards.nth(index).evaluate((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { x, y };
    });
  const [first, second, third, fourth] = await Promise.all([
    position(0),
    position(1),
    position(2),
    position(3),
  ]);
  expect(second.x).toBeGreaterThan(first.x);
  expect(third.x).toBeGreaterThan(second.x);
  expect(second.y).toBeCloseTo(first.y, 0);
  expect(third.y).toBeCloseTo(first.y, 0);
  expect(fourth.x).toBeCloseTo(first.x, 0);
  expect(fourth.y).toBeGreaterThan(first.y);

  const focus = () =>
    panel.evaluate((element) => ({
      inside: element.contains(document.activeElement),
      accessibleName: document.activeElement?.getAttribute('aria-label'),
      text: document.activeElement?.textContent,
    }));
  const initialFocus = await focus();
  expect(initialFocus.inside).toBe(true);
  await page.keyboard.press('Tab');
  const nextFocus = await focus();
  expect(nextFocus.inside).toBe(true);
  expect(nextFocus).not.toEqual(initialFocus);

  await listView.click();
  await expect(inputs).toHaveAttribute('data-input-view', 'list');
  await expect(listView).toHaveAttribute('aria-pressed', 'true');
  await expect(gridView).toHaveAttribute('aria-pressed', 'false');
  const [listFirst, listSecond] = await Promise.all([position(0), position(1)]);
  expect(listSecond.x).toBeCloseTo(listFirst.x, 0);
  expect(listSecond.y).toBeGreaterThan(listFirst.y);
  await gridView.click();
  await expect(inputs).toHaveAttribute('data-input-view', 'grid');

  const gallery = inputs.locator('[data-picker-list]');
  await gallery.focus();
  await gallery.press('Home');
  await gallery.press('ArrowRight');
  await expect(gallery).toHaveAttribute('aria-activedescendant', /-opt-1$/);
  await gallery.press('ArrowDown');
  await expect(gallery).toHaveAttribute('aria-activedescendant', /-opt-4$/);

  const dialogWidth = await panel.evaluate((node: HTMLElement) => node.style.width);
  const resizeDialog = (width: string) =>
    panel.evaluate((node: HTMLElement, size) => (node.style.width = size), width);
  await resizeDialog('820px');
  await expect.poll(async () => (await position(2)).x).toBeCloseTo((await position(0)).x, 0);
  await expect.poll(async () => (await position(2)).y).toBeGreaterThan((await position(0)).y);
  await resizeDialog('540px');
  await expect.poll(async () => (await position(1)).x).toBeCloseTo((await position(0)).x, 0);
  await expect.poll(async () => (await position(1)).y).toBeGreaterThan((await position(0)).y);
  await resizeDialog(dialogWidth);

  // 🔴 Escape closes the PICKER — the dialog under it survives, and focus is back on the field.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(field).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('Inputs: the Playout’s inputs by name, in its order; a route is an ordinary input now; no address anywhere', async ({
  app,
}) => {
  const page = app.page;
  const dialog = await openDefaults(app);
  const field = dialog.locator('[data-defaults-select="l-1"]');
  await field.click();
  const panel = picker(page);

  await expect(panel.locator('[data-picker-input] .cg-picker-row__name')).toHaveText([
    'Studio 1',
    'Studio 2',
    'Studio 3',
    'دوربین خبر',
    'Multicast',
    'ورودی ۳',
    'ورودی ۴',
  ]);
  // Each row is the icon and the NAME only — no kind word, no address.
  await expect(panel.locator('[data-picker-input="in-studio-1"]')).toHaveText('Studio 1');

  // `ROUTE-PLATES-01` §1.G — the gate is gone: a route is enabled, by its name alone, with no tag
  // (a template's defaults name no channel, so rule 1 is asked where a row takes it)…
  const route = panel.locator('[data-picker-input="in-input-3"]');
  await expect(route).toBeEnabled();
  await expect(route).toHaveText('ورودی ۳');
  await expect(route.locator('.cg-source-tag')).toHaveCount(0);
  // …and control: a camera is enabled, the same way.
  await expect(panel.locator('[data-picker-input="in-studio-1"]')).toBeEnabled();
  await expect(field).toHaveAttribute('data-picker-value', '');

  // 🔴 §1.E — no stream URL, no credentials, no NDI name, no path: anywhere on the page.
  const html = await page.content();
  for (const address of ['secret', 'rtsp://', 'udp://', 'STUDIO-PC', 'Media Library']) {
    expect(html, `the page shows ${address}`).not.toContain(address);
  }
  // Control: the names are there.
  expect(html).toContain('دوربین خبر');
  await page.keyboard.press('Escape');
});

test('Media: searched on the Playout’s side, Persian included; the list pages through every item once, and never audio', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  const dialog = await openDefaults(app);
  await dialog.locator('[data-defaults-select="l-1"]').click();
  const panel = picker(page);
  await panel.getByRole('tab', { name: /^Media/ }).click();
  const search = panel.locator('[data-picker-search]');
  // The search field takes focus when the tab opens.
  await expect(search).toBeFocused();
  const names = panel.locator('[data-picker-media] .cg-picker-row__name');

  // The contract's normalisation — Arabic ي/ك as Persian, Persian digits as Latin.
  await search.fill('كليپ');
  await expect(names).toHaveText(['کلیپ معرفی']);
  await search.fill('خبر 1405');
  await expect(names).toHaveText(['خبر ۱۴۰۵']);
  // Control: a term that matches nothing says so, naming what was asked.
  await search.fill('zzzz');
  await expect(panel.locator('[data-picker-empty="media"]')).toHaveText('No media matches “zzzz”.');

  /*
    🔴 PAGING, SCROLLED FOR REAL. Pages of 50, the next fetched as the list nears its end; the list
    is virtualised, so it is walked half a viewport at a time and every row it draws is recorded
    by its INDEX. The whole library must arrive — 124 items, each at exactly one index — and the
    one audio item never.
  */
  await search.fill('');
  const list = panel.locator('[data-picker-tab="media"] [role="grid"]');
  await expect(list.locator('[data-picker-media]').first()).toBeVisible();
  const byIndex = new Map<number, string>();
  let idleAtEnd = 0;
  for (let step = 0; step < 400 && idleAtEnd < 3; step++) {
    const read = await list.evaluate((el) => {
      const rows = [...el.querySelectorAll('[data-vlist-index][data-picker-media]')].map(
        (n) =>
          [
            Number(n.getAttribute('data-vlist-index')),
            n.getAttribute('data-picker-media') ?? '',
          ] as const,
      );
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      el.scrollTop += Math.max(Math.floor(el.clientHeight / 2), 1);
      return { rows, atEnd };
    });
    const before = byIndex.size;
    for (const [index, id] of read.rows) byIndex.set(index, id);
    idleAtEnd = read.atEnd && byIndex.size === before ? idleAtEnd + 1 : 0;
    await page.waitForTimeout(40);
  }
  const ids = [...byIndex.values()];
  expect(ids.length, 'every item in the library arrived').toBe(124);
  expect(new Set(ids).size, 'no item arrived twice').toBe(ids.length);
  expect(ids, 'audio is never offered').not.toContain('md-m-bed');
  await page.keyboard.press('Escape');
});

test('🔴 separation: the media `Studio 1` is a media row only, and the input `Studio 1` an input only', async ({
  app,
}) => {
  const page = app.page;
  const dialog = await openDefaults(app);
  await dialog.locator('[data-defaults-select="l-1"]').click();
  const panel = picker(page);

  // Media, searching `Studio`: the media item, with the media icon — and no input.
  await panel.getByRole('tab', { name: /^Media/ }).click();
  await panel.locator('[data-picker-search]').fill('Studio');
  const media = panel.locator('[data-picker-media="md-m-studio1"]');
  await expect(media).toContainText('Studio 1');
  await expect(media.locator('.lucide-film')).toHaveCount(1);
  await expect(panel.locator('[data-picker-input]')).toHaveCount(0);

  // Control: Inputs lists the INPUT `Studio 1`, with the input icon — and no media row at all.
  await panel.getByRole('tab', { name: /^Inputs/ }).click();
  const input = panel.locator('[data-picker-input="in-studio-1"]');
  await expect(input).toHaveText('Studio 1');
  await expect(input.locator('.lucide-cable')).toHaveCount(1);
  await expect(panel.locator('[data-picker-media]')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('Media: visible posters decode separately, and a clip without a poster can still be selected', async ({
  app,
}) => {
  const page = app.page;
  const dialog = await openDefaults(app);
  await page.evaluate(() => {
    const state = { reads: [] as string[], inputChecks: 0 };
    Object.assign(window, { mediaPosterTest: state });
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('Canvas 2D is unavailable');
    ctx.fillStyle = '#f00000';
    ctx.fillRect(0, 0, 16, 9);
    const red = canvas.toDataURL('image/jpeg');
    ctx.fillStyle = '#0000f0';
    ctx.fillRect(0, 0, 16, 9);
    const blue = canvas.toDataURL('image/jpeg');
    window.cg.sources.mediaThumbnail = ({ id }) => {
      state.reads.push(id);
      if (id === 'md-m-clip-001') return Promise.resolve({ ok: true, dataUrl: red });
      if (id === 'md-m-clip-002') return Promise.resolve({ ok: true, dataUrl: blue });
      return Promise.resolve({ ok: false });
    };
    const start = window.cg.livePreview.start;
    window.cg.livePreview.start = (request) => {
      state.inputChecks += 1;
      return start(request);
    };
  });
  const readState = () =>
    page.evaluate(
      () =>
        (window as unknown as { mediaPosterTest: { reads: string[]; inputChecks: number } })
          .mediaPosterTest,
    );

  const field = dialog.locator('[data-defaults-select="l-1"]');
  await field.click();
  const panel = picker(page);
  expect(await readState()).toEqual({ reads: [], inputChecks: 0 });
  await panel.getByRole('tab', { name: /^Media/ }).click();
  const tile = (id: string) => panel.locator(`[data-picker-media="${id}"] [data-media-thumbnail]`);
  const red = tile('md-m-clip-001').locator('img');
  const blue = tile('md-m-clip-002').locator('img');
  const missing = tile('md-m-clip-003');
  const sample = (image: Locator) =>
    image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('Canvas 2D is unavailable');
      ctx.drawImage(element, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    });
  await expect(red).toBeVisible();
  await expect(blue).toBeVisible();
  const [redPixel, bluePixel] = await Promise.all([sample(red), sample(blue)]);
  expect(redPixel[0]).toBeGreaterThan(220);
  expect(redPixel[2]).toBeLessThan(15);
  expect(bluePixel[0]).toBeLessThan(15);
  expect(bluePixel[2]).toBeGreaterThan(220);
  await missing.scrollIntoViewIfNeeded();
  await expect(missing).toHaveText('No poster');
  await expect(missing.locator('img')).toHaveCount(0);
  await expect.poll(async () => (await readState()).reads).toContain('md-m-clip-003');
  expect((await readState()).reads).not.toContain('md-m-clip-009');
  await expect(field).toHaveAttribute('data-picker-value', '');
  await missing.click();
  await expect(panel).toHaveCount(0);
  await expect(field).toHaveAttribute('data-picker-value', 'md-m-clip-003');
  expect((await readState()).inputChecks).toBe(0);
});

test('Media: play, pause, drag to seek and stop a preview without choosing the clip', async ({
  app,
}) => {
  const page = app.page;
  const dialog = await openDefaults(app);
  const field = dialog.locator('[data-defaults-select="l-1"]');
  const jpegBase64 = FRAME_A.toString('base64');
  await page.evaluate((jpegBase64) => {
    const positions: number[] = [];
    Object.assign(window, { sourcePreviewPositions: positions });
    window.cg.sourcePreviews.thumbnails = ({ mediaPosition }) => {
      if (mediaPosition === undefined) return Promise.resolve({ frames: [] });
      const { sourceId, atMs } = mediaPosition;
      positions.push(atMs);
      return Promise.resolve({
        frames: [],
        mediaFrame: {
          sourceId,
          signal: 'present',
          jpegBase64,
          width: 64,
          height: 36,
          previewPositionMs: atMs,
        },
      });
    };
  }, jpegBase64);
  const positions = () =>
    page.evaluate(
      () => (window as unknown as { sourcePreviewPositions: number[] }).sourcePreviewPositions,
    );

  await field.click();
  const panel = picker(page);
  await panel.getByRole('tab', { name: /^Media/ }).click();
  await panel.getByRole('textbox', { name: 'Search media' }).fill('Studio');
  await panel.getByRole('button', { name: 'Preview · Studio 1' }).click();
  const play = panel.getByRole('button', { name: 'Play preview' });
  const pause = panel.getByRole('button', { name: 'Pause preview' });
  const stop = panel.getByRole('button', { name: 'Stop preview' });
  const seek = panel.getByRole('slider', { name: 'Preview position' });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(pause).toBeEnabled();
  await expect.poll(async () => (await positions()).some((position) => position > 0)).toBe(true);
  await pause.click();
  await expect(play).toBeEnabled();
  const playingPosition = Number(await seek.inputValue());
  expect(playingPosition).toBeGreaterThan(0);

  const seekBox = await seek.boundingBox();
  if (seekBox === null) throw new Error('the video preview must have a seek bar');
  const y = seekBox.y + seekBox.height / 2;
  await page.mouse.move(seekBox.x + seekBox.width / 4, y);
  await page.mouse.down();
  await page.mouse.move(seekBox.x + (seekBox.width * 3) / 4, y, { steps: 6 });
  await page.mouse.up();
  const max = Number(await seek.getAttribute('max'));
  await expect.poll(async () => (await positions()).at(-1)).toBeGreaterThan(max / 2);
  await stop.click();
  await expect(seek).toHaveValue('0');
  await expect(field).toHaveAttribute('data-picker-value', '');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('data-picker-value', '');
});

interface SourceMeterProbe {
  batches: { channel: number; ids: string[]; maxChannels: number | undefined }[];
  checked: string[];
  hold: boolean;
  wide: boolean;
  release?: () => void;
}

test.describe('source audio meters', () => {
  test.use({
    playoutSources: {
      ...E2E_PLAYOUT,
      media: [
        {
          id: 'm-meter-silent',
          name: 'Meter fixture still',
          clip: 'D:/Media Library/silent.png',
          type: 'still',
        },
        {
          id: 'm-meter-sound',
          name: 'Meter fixture sound clip',
          clip: 'D:/Media Library/sound.mov',
          type: 'video',
        },
        ...(E2E_PLAYOUT.media ?? []),
      ],
    },
  });

  test('picker and Setup show current input levels independently of Check input', async ({
    app,
  }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 900 });
    const dialog = await openDefaults(app);
    await page.evaluate(() => {
      const state: SourceMeterProbe = { batches: [], checked: [], hold: false, wide: false };
      Object.assign(window, { sourceMeterTest: state });
      window.cg.sourcePreviews.audioLevels = ({ channel, sourceIds, maxChannels }) => {
        state.batches.push({ channel, ids: sourceIds, maxChannels });
        if (state.hold) {
          return new Promise((resolve) => {
            state.release = () => resolve({ readings: [] });
          });
        }
        const dbFs = [-21, -17, -39, -48, -9, -57];
        if (state.wide) dbFs.push(...Array.from({ length: 26 }, () => -30));
        return Promise.resolve({
          readings: sourceIds.map((sourceId) =>
            sourceId === 'in-studio-1'
              ? {
                  sourceId,
                  state: 'measured',
                  dbFs,
                  validForMs: 300,
                }
              : {
                  sourceId,
                  state:
                    sourceId === 'in-studio-2'
                      ? 'no-audio'
                      : sourceId === 'in-studio-3'
                        ? 'has-audio'
                        : 'unknown',
                },
          ),
        });
      };
      const startCheck = window.cg.livePreview.start;
      window.cg.livePreview.start = (request) => {
        state.checked.push(request.sourceId);
        return startCheck(request);
      };
    });
    const readState = () =>
      page.evaluate(() => {
        const { batches, checked, release } = (
          window as unknown as { sourceMeterTest: SourceMeterProbe }
        ).sourceMeterTest;
        return { batches, checked, pending: release !== undefined };
      });
    const field = dialog.locator('[data-defaults-select="l-1"]');
    await field.click();
    const panel = picker(page);
    const controls = '[data-source-audio-meter]';
    const meter = (id: string) =>
      panel
        .locator('.cg-vlist-action-row', { has: page.locator(`[data-picker-input="${id}"]`) })
        .locator(controls);
    const peak = meter('in-studio-1');
    const rails = peak.locator('[data-input-meter-channel]');
    const expectAttached = async (locator: typeof peak): Promise<void> => {
      const geometry = await locator.evaluate((element) => {
        const meterBox = element.getBoundingClientRect();
        const picture = element.previousElementSibling?.getBoundingClientRect();
        if (picture === undefined) throw new Error('An input meter must have its own picture');
        return {
          gap: meterBox.left - picture.right,
          dy: meterBox.top - picture.top,
          heightDifference: meterBox.height - picture.height,
        };
      });
      expect(Math.abs(geometry.gap)).toBeLessThan(0.5);
      expect(Math.abs(geometry.dy)).toBeLessThan(0.5);
      expect(Math.abs(geometry.heightDifference)).toBeLessThan(0.5);
    };
    await expect(peak).toHaveAccessibleName('Studio 1 · Audio peak -9 dBFS');
    await expect(panel.locator('[data-picker-input="in-studio-1"]')).toHaveAccessibleName(
      'Studio 1',
    );
    await expect(rails).toHaveCount(6);
    const mappedClips = [
      /^inset\(35%/,
      /^inset\(28\.33/,
      /^inset\(65%/,
      /^inset\(80%/,
      /^inset\(15%/,
      /^inset\(95%/,
    ];
    for (const [index, expected] of mappedClips.entries()) {
      await expect(rails.nth(index)).toHaveAttribute('data-input-meter-channel', String(index + 1));
      await expect(rails.nth(index).locator('.cg-input-meter__level')).toHaveCSS(
        'clip-path',
        expected,
      );
    }
    const columns = await rails.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, width: box.width };
      }),
    );
    for (const [index, column] of columns.entries()) {
      if (index === 0) continue;
      const previous = columns[index - 1]!;
      expect(column.width).toBeCloseTo(previous.width, 1);
      expect(column.x).toBeCloseTo(previous.x + previous.width + 1, 1);
    }
    await expect(peak).toHaveCSS('column-gap', '1px');
    await expectAttached(peak);
    const bounds = await peak.boundingBox();
    if (bounds === null) throw new Error('Visible source meter has no size');
    expect(bounds.width).toBeLessThanOrEqual(32);
    expect(bounds.height).toBeGreaterThan(24);
    await test.info().attach('source-meter-size', {
      body: `${String(bounds.width)} × ${String(bounds.height)} px`,
      contentType: 'text/plain',
    });
    await expect(meter('in-studio-2')).toHaveAttribute('title', 'No audio stream');
    await expect(meter('in-studio-2')).toHaveCSS('border-top-style', 'dashed');
    await expect(meter('in-studio-2').locator('[data-input-meter-channel]')).toHaveCount(2);
    await expect(meter('in-input-4')).toHaveAttribute('title', 'Audio level unavailable');
    await expect(panel.locator('[data-picker-input="in-input-4"]')).toContainText('Unavailable');
    const initial = await readState();
    expect(
      initial.batches.every(({ channel, maxChannels }) => channel === 1 && maxChannels === 32),
    ).toBe(true);
    expect(initial.batches.flatMap(({ ids }) => ids)).not.toContain('in-input-4');
    expect(initial.checked).toEqual([]);

    await page.evaluate(() => {
      (window as unknown as { sourceMeterTest: SourceMeterProbe }).sourceMeterTest.hold = true;
    });
    await expect.poll(async () => (await readState()).pending).toBe(true);
    await expect(peak).toHaveAttribute('title', 'Audio level unavailable');
    await expect(rails).toHaveCount(6);
    for (const rail of await rails.all()) {
      await expect(rail.locator('.cg-input-meter__level')).toHaveCSS(
        'clip-path',
        'inset(100% 0px 0px)',
      );
    }
    await page.evaluate(() => {
      const state = (window as unknown as { sourceMeterTest: SourceMeterProbe }).sourceMeterTest;
      state.hold = false;
      state.release?.();
      delete state.release;
    });
    await expect(peak).toHaveAttribute('title', 'Audio peak -9 dBFS');

    await panel.locator('[data-picker-input="in-studio-1"]').click();
    const fieldMeter = field.locator(controls);
    await expect(fieldMeter).toHaveAttribute('data-input-meter-orientation', 'vertical');
    await expect(fieldMeter.locator('[data-input-meter-channel]')).toHaveCount(6);
    await expectAttached(fieldMeter);
    await page.evaluate(() => {
      (window as unknown as { sourceMeterTest: SourceMeterProbe }).sourceMeterTest.wide = true;
    });
    const comboRails = fieldMeter.locator('[data-input-meter-channel]');
    await expect(comboRails).toHaveCount(32);
    await expect(comboRails.last()).toHaveAttribute('data-input-meter-channel', '32');
    await expect(comboRails.last().locator('.cg-input-meter__level')).toHaveCSS(
      'clip-path',
      'inset(50% 0px 0px)',
    );
    await expectAttached(fieldMeter);
    const comboBounds = (await fieldMeter.boundingBox())!;
    expect(comboBounds.width).toBeLessThanOrEqual(80);
    const fieldBounds = (await field.boundingBox())!;
    expect(comboBounds.x + comboBounds.width).toBeLessThan(fieldBounds.x + fieldBounds.width);
    await field.click();
    await panel.getByRole('tab', { name: /^Media/ }).click();
    await panel.getByRole('textbox', { name: 'Search media' }).fill('Meter fixture');
    const still = panel.locator('[data-picker-media="md-m-meter-silent"]');
    const clip = panel.locator('[data-picker-media="md-m-meter-sound"]');
    await expect(still).toBeVisible();
    await expect(clip).toBeVisible();
    await expect(still.locator(controls)).toHaveCount(0);
    await expect(clip.locator(controls)).toHaveCount(0);
    await clip.click();
    await expect(field).toHaveAttribute('data-picker-value', 'md-m-meter-sound');
    await expect(fieldMeter).toHaveCount(0);
    expect((await readState()).batches.flatMap(({ ids }) => ids)).not.toContain(
      'md-m-meter-silent',
    );
    expect((await readState()).batches.flatMap(({ ids }) => ids)).not.toContain('md-m-meter-sound');
    expect((await readState()).checked).toEqual([]);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await app.openStationSetupAt('Live sources');
    const sources = page.getByRole('region', { name: 'Inputs from the Playout' });
    const setupMeter = sources.getByRole('img', { name: 'Studio 1 · Audio peak -9 dBFS' });
    await expect(setupMeter).toBeVisible();
    await expect(setupMeter.locator('[data-input-meter-channel]')).toHaveCount(32);
    await expectAttached(setupMeter);
    const silent = sources.getByRole('img', { name: 'Studio 2 · No audio stream' });
    const withoutLevel = sources.getByRole('img', {
      name: 'Studio 3 · Audio stream present, level unavailable',
    });
    await expect(silent).toBeVisible();
    const neutralBorder = await silent.evaluate((el) => getComputedStyle(el).borderTopColor);
    await expect(withoutLevel).toHaveCSS('border-top-color', neutralBorder);
    expect((await readState()).checked).toEqual([]);
  });
});

test.describe('live source thumbnails', () => {
  test.use({
    playoutSources: {
      ...E2E_PLAYOUT,
      inputs: {
        ...E2E_PLAYOUT.inputs,
        inputs: [
          ...E2E_PLAYOUT.inputs.inputs,
          {
            id: 'fixture-playlist',
            name: 'Clean Playlist',
            casparHost: '127.0.0.1',
            producer: { kind: 'route', channel: 1, layer: 7 },
            available: true,
            playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
            compatibleChannels: [{ casparHost: '127.0.0.1', casparChannel: 1 }],
          },
          ...Array.from({ length: 6 }, (_, index) => ({
            id: `extra-${index + 1}`,
            name: `Extra ${index + 1}`,
            producer: { kind: 'ndi', source: `Extra ${index + 1}` },
          })),
        ],
      },
    },
  });

  test('only visible rows request pictures and filtering or closing drops thumbnail demand', async ({
    app,
  }) => {
    const page = app.page;
    const dialog = await openDefaults(app);
    const liveJpeg = FRAME_A.toString('base64');
    const playlistJpeg = FRAME_B.toString('base64');
    await page.evaluate(
      ({ liveJpeg, playlistJpeg }) => {
        const batches: { channel: number; ids: string[]; time: number }[] = [];
        const state = { batches, checks: 0 };
        Object.assign(window, { sourcePreviewTest: state });
        window.cg.sourcePreviews = {
          pvw: () => Promise.resolve({ frames: [] }),
          thumbnails: ({ channel, sourceIds }) => {
            batches.push({ channel, ids: sourceIds, time: performance.now() });
            return Promise.resolve({
              frames: sourceIds.map((sourceId) => ({
                sourceId,
                signal:
                  sourceId === 'in-studio-2'
                    ? 'absent'
                    : sourceId === 'in-fixture-playlist'
                      ? 'unknown'
                      : 'present',
                jpegBase64: sourceId === 'in-fixture-playlist' ? playlistJpeg : liveJpeg,
                width: 64,
                height: 36,
              })),
            });
          },
        };
        const start = window.cg.livePreview.start;
        window.cg.livePreview.start = (request) => {
          state.checks++;
          return start(request);
        };
      },
      { liveJpeg, playlistJpeg },
    );
    await page.clock.install();
    const readState = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              sourcePreviewTest: {
                batches: { channel: number; ids: string[]; time: number }[];
                checks: number;
              };
            }
          ).sourcePreviewTest,
      );
    expect(await readState()).toEqual({ batches: [], checks: 0 });
    const field = dialog.locator('[data-defaults-select="l-1"]');
    await field.click();
    const panel = picker(page);
    const tile = (id: string) =>
      panel
        .locator('.cg-vlist-action-row', { has: page.locator(`[data-picker-input="${id}"]`) })
        .locator('[data-input-thumbnail]');
    const live = tile('in-studio-1').locator('img');
    const playlist = tile('in-fixture-playlist').locator('img');
    await expect(live).toHaveAttribute('src', `data:image/jpeg;base64,${liveJpeg}`);
    await expect(playlist).toHaveAttribute('src', `data:image/jpeg;base64,${playlistJpeg}`);
    await expect(
      tile('in-fixture-playlist').locator('..').locator('[data-input-meter-channel]'),
    ).toHaveCount(2);
    expect(
      await live.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return image.naturalWidth;
      }),
    ).toBe(64);
    await expect(tile('in-studio-2')).toHaveText('No signal');
    await expect(tile('in-studio-2').locator('img')).toHaveCount(0);
    const { batches: initial } = await readState();
    expect(initial[0]?.channel).toBe(1);
    expect(initial[0]?.ids).toEqual(expect.arrayContaining(['in-studio-1', 'in-fixture-playlist']));
    expect(initial.flatMap((batch) => batch.ids)).not.toContain('in-extra-6');

    await panel.getByRole('textbox', { name: 'Filter inputs' }).fill('Extra 6');
    await expect(tile('in-extra-6').locator('img')).toBeVisible();
    const { batches, checks } = await readState();
    expect(batches.at(-1)?.ids).toEqual(['in-extra-6']);
    expect(batches.every((batch) => batch.ids.length <= 8)).toBe(true);
    expect(
      batches.every(
        (batch, index) => index === 0 || batch.time - (batches[index - 1]?.time ?? 0) >= 999,
      ),
    ).toBe(true);
    expect(checks).toBe(0);
    await expect(field).toHaveAttribute('data-picker-value', '');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    const closed = await readState();
    await page.clock.runFor(1_100);
    expect(await readState()).toEqual(closed);
  });
});

test('🔴 the owner’s take: a plate on an input and a plate on a media item — it plays, and Plate inputs name both', async ({
  app,
}) => {
  const page = app.page;
  await registerTemplate(page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);

  const looks = app.inspector.locator('[aria-label="Plate inputs"]');
  await app.chooseSource(looks.locator('[data-look-binding="two:l-1"]'), { input: 'Studio 1' });
  await app.chooseSource(looks.locator('[data-look-binding="two:l-2"]'), {
    media: 'خبر ۱۴۰۵',
    search: 'خبر',
  });
  await app.applyEdits();

  await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerRow(row).getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  // Each field names its source by NAME, with its own icon — the input's cable, the clip's film
  // and length — and never an id or an address.
  const first = looks.locator('[data-look-binding="two:l-1"] [data-source-label="input"]');
  await expect(first.locator('.cg-source-label__name')).toHaveText('Studio 1');
  await expect(first.locator('.lucide-cable')).toHaveCount(1);
  const second = looks.locator('[data-look-binding="two:l-2"] [data-source-label="media"]');
  await expect(second.locator('.cg-source-label__name')).toHaveText('خبر ۱۴۰۵');
  await expect(second.locator('.lucide-film')).toHaveCount(1);
  await expect(second.locator('.cg-source-label__meta')).toHaveText('17:39');
  await expect(looks).not.toContainText('md-m-khabar');
});
