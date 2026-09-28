import type { Locator, Page } from '@playwright/test';
import { E2E_PLAYOUT, cssColour, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `MEDIA-PLATES-01` §2 — **A CLIP'S `Playback` AND ITS TRANSPORT, IN A REAL ENGINE.**
 *
 * `mediaPlates.dom.test.ts` pins which plate gets which control and what each press sends. It
 * cannot answer what this file is for, because jsdom has no layout (golden rule 12c):
 *
 *   1. the `Playback` button sits ON THE FIELD'S LINE, to its right, and the field keeps its room;
 *   2. its panel HANGS FROM THE BUTTON, inside the viewport — and over the Source defaults dialog it
 *      is a panel, not a second modal: Escape closes it alone;
 *   3. the owner's check, against the offline mock: the clip on air reads `−0:12`; Pause reads
 *      `Paused`; Restart reads its full length again; a live input beside it offers nothing.
 *
 * Against the offline MockRuntime: the Playout's list is the fake's (`E2E_PLAYOUT`), and which plate
 * carries a clip — the bridge's `liveLayers.media-state` — is seeded, because the mock seats nothing.
 * Windows runs are NON-authoritative (golden rule 12a).
 */

const TPL = 'tpl-e2e-media';
const CLIP = 'md-m-kelip';

test.use({
  playoutSources: E2E_PLAYOUT,
  mediaState: [
    { templateId: TPL, plateId: 'l-2', lengthMs: 30_000, remainingMs: 12_000, sourceId: CLIP },
  ],
});

/** Two plates, one look placing both — the owner's two-box case. */
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
        name: 'media',
        sourceFileName: 'media.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
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
      html: '<!doctype html><html><body>media</body></html>',
    });
  }, TPL);
}

/** The catalogue entry for the clip, as the console holds it. */
async function clipSettings(
  page: Page,
): Promise<{ loop: boolean | undefined; whenHidden: string | undefined }> {
  return page.evaluate(async (id) => {
    const w = window as unknown as {
      cg: {
        sources: {
          config: () => Promise<{
            sources: { id: string; media?: { loop?: boolean; whenHidden?: string } }[];
          }>;
        };
      };
    };
    const catalog = await w.cg.sources.config();
    const media = catalog.sources.find((s) => s.id === id)?.media ?? {};
    return { loop: media.loop, whenHidden: media.whenHidden };
  }, CLIP);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('the element has no box — it is not rendered');
  return b;
}

test('🔴 the owner’s check: the clip on air counts, pauses and restarts — and a live input offers nothing', async ({
  app,
}) => {
  const page = app.page;
  await registerTemplate(page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);

  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await app.chooseSource(looks.locator('[data-look-binding="two:l-1"]'), { input: 'Studio 1' });
  await app.chooseSource(looks.locator('[data-look-binding="two:l-2"]'), {
    media: 'کلیپ معرفی',
    search: 'کلیپ',
  });
  await app.applyEdits();
  await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerRow(row).getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  const transport = looks.locator('[data-media-transport="l-2"]');
  await expect(transport).toBeVisible();
  await expect(transport.locator('[data-media-remaining]')).toHaveText('−0:12');
  // Control: the input beside it has neither a transport nor a Playback.
  await expect(looks.locator('[data-media-transport="l-1"]')).toHaveCount(0);
  await expect(looks.locator('[data-media-playback]')).toHaveCount(1);

  // By ACCESSIBLE NAME: the console's tooltip layer lifts a hovered control's `title` into its own
  // tooltip, so the attribute reads empty under the pointer that just pressed it.
  const playPause = transport.locator('[data-media-transport-play]');
  await expect(playPause).toHaveAccessibleName('Pause');
  await playPause.click();
  await expect(transport.locator('.cg-source-tag--paused')).toHaveText('Paused');
  await expect(playPause).toHaveAccessibleName('Play');

  await transport.locator('[data-media-transport-restart]').click();
  await expect(transport.locator('[data-media-remaining]')).toHaveText('−0:30');
  await expect(transport.locator('.cg-source-tag--paused')).toHaveCount(0);

  // The transport line sits under its plate's field, inside the Inspector.
  const field = await box(looks.locator('[data-look-binding="two:l-2"]'));
  const line = await box(transport);
  expect(line.y, 'under the field').toBeGreaterThanOrEqual(field.y + field.height - 1);
  const inspector = await box(app.inspector);
  expect(line.x + line.width, 'inside the Inspector').toBeLessThanOrEqual(
    inspector.x + inspector.width + 1,
  );
});

test('🔴 `Playback` sits on the field’s line, hangs its panel from itself, and sets the CLIP’s settings', async ({
  app,
}) => {
  const page = app.page;
  await registerTemplate(page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);
  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await app.chooseSource(looks.locator('[data-look-binding="two:l-2"]'), {
    media: 'کلیپ معرفی',
    search: 'کلیپ',
  });
  await app.applyEdits();

  const button = looks.locator(`[data-media-playback="${CLIP}"]`);
  await expect(button).toBeVisible();
  const field = await box(looks.locator('[data-look-binding="two:l-2"]'));
  const b = await box(button);
  // ON THE FIELD'S LINE, to its right — and the field keeps the room: wider than the button by far.
  expect(Math.abs(b.y + b.height / 2 - (field.y + field.height / 2))).toBeLessThanOrEqual(2);
  expect(b.x).toBeGreaterThanOrEqual(field.x + field.width - 1);
  expect(field.width).toBeGreaterThan(b.width * 4);

  await button.click();
  const panel = page.locator(`[data-media-playback-panel="${CLIP}"]`);
  await expect(panel).toBeVisible();
  await expect(panel.locator('h3')).toHaveText('کلیپ معرفی');
  const p = await box(panel);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  // It HANGS FROM THE BUTTON: below it (or above, when there is no room), and inside the viewport.
  const below = p.y >= b.y + b.height - 1;
  const above = p.y + p.height <= b.y + 1;
  expect(below || above, 'anchored to the button').toBe(true);
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(viewport.width);
  expect(p.y + p.height).toBeLessThanOrEqual(viewport.height);

  // The three choices on ONE line, and a press lands on the clip — station-wide, at once.
  const choices = panel.locator('[data-media-when-hidden]');
  await expect(choices).toHaveText(['Pause', 'Restart', 'Keep playing']);
  const tops = await Promise.all([0, 1, 2].map(async (i) => (await box(choices.nth(i))).y));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  await expect(choices.nth(0)).toHaveAttribute('aria-pressed', 'true');
  // The chosen one wears the console's chosen-not-on-air BLUE — never `.is-on`'s violet, which
  // means PVW here (`design.md` §29). Measured against the tokens, not a hex.
  const fill = await choices.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).toBe(await cssColour(page, 'var(--r-look-btn-sel-bg)'));
  expect(fill).not.toBe(await cssColour(page, 'var(--r-rehearsing-strong)'));
  // `When hidden` is ONE line, as tall as `Loop` — the panel is wide enough for it.
  const labels = panel.locator('.cg-playback__label');
  const [loopLabel, hiddenLabel] = [await box(labels.nth(0)), await box(labels.nth(1))];
  expect(Math.abs(hiddenLabel.height - loopLabel.height)).toBeLessThanOrEqual(1);
  await choices.nth(2).click();
  await expect(choices.nth(2)).toHaveAttribute('aria-pressed', 'true');
  expect(await clipSettings(page)).toEqual({ loop: false, whenHidden: 'continue' });
  // A controlled box: it shows what the catalogue says once the bridge has taken the setting.
  await panel.locator('[data-media-loop] input').click();
  await expect.poll(() => clipSettings(page)).toEqual({ loop: true, whenHidden: 'continue' });
  await expect(panel.locator('[data-media-loop] input')).toBeChecked();

  // Escape closes the panel, and the keyboard is back on the button that opened it.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('🔴 in Source defaults, a bound clip carries `Playback` too — a panel over the dialog, closed alone', async ({
  app,
}) => {
  const page = app.page;
  await registerTemplate(page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);
  // The clip becomes BOUND on the station when the default is saved (the bridge's own read).
  await app.setTemplateDefault('l-2', { media: 'کلیپ معرفی', search: 'کلیپ' });

  await app.inspector.locator('[data-open-template-defaults]').click();
  const dialog = page.getByRole('dialog', { name: 'Source defaults' });
  await expect(dialog).toBeVisible();
  const button = dialog.locator(`[data-media-playback="${CLIP}"]`);
  await expect(button).toBeVisible();
  // Control: the plate with no default carries none.
  await expect(dialog.locator('[data-media-playback]')).toHaveCount(1);

  await button.click();
  const panel = page.locator(`[data-media-playback-panel="${CLIP}"]`);
  await expect(panel).toBeVisible();
  // Over the dialog: the panel's own centre is the panel's, not the dialog's.
  const p = await box(panel);
  const onTop = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-media-playback-panel]') !== null,
    { x: p.x + p.width / 2, y: p.y + p.height / 2 },
  );
  expect(onTop, 'the panel is drawn over the dialog').toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(dialog, 'Escape closed the panel ALONE').toBeVisible();
});
