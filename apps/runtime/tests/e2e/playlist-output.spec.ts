import { PlayoutInputSchema } from '@cg/shared-ipc';
import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` C (`R-075`) — **THE PLAYOUT'S PLAYLIST OUTPUT AS A BOX SOURCE, IN A REAL ENGINE.**
 *
 * The seeded Playout lists its playlist output (`خروجیِ پخش: …`, `route://1-7`, `playlistOf` channel 1) beside
 * its live inputs. Bound to the seeded row's first plate, the LIVE PLATES strip reads it LOCKED at 0 and every
 * audio control is disabled with `Programme sound is already on air`; the held plate beside it keeps its
 * controls (the control). The wire half — `VOLUME 0` before `PLAY`, a raise refused, nothing ever to layer 7 —
 * is `tools/caspar-bridge/tests/route-plates.integration.test.ts`; the jsdom twin is
 * `playlistAudioLock.dom.test.ts`. Windows runs are NON-authoritative (golden rule 12a).
 */

const PLAYLIST = {
  id: 'pl-apasai',
  name: 'خروجیِ پخش: آپاسای',
  producer: { kind: 'route', channel: 1, layer: 7, videoMode: '1080i5000' },
  compatibleChannels: [
    { casparHost: '127.0.0.1', casparChannel: 1 },
    { casparHost: '127.0.0.1', casparChannel: 2 },
  ],
  available: true,
  playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
} as const;

const UNAVAILABLE_PLAYLIST = {
  ...PLAYLIST,
  id: 'pl-second',
  name: 'Playlist 2',
  producer: { ...PLAYLIST.producer, channel: 2 },
  available: false,
  reason: 'not-running',
  playlistOf: { ...PLAYLIST.playlistOf, casparChannel: 2 },
} as const;

test.use({
  playoutSources: {
    ...E2E_PLAYOUT,
    inputs: {
      ...E2E_PLAYOUT.inputs,
      inputs: [...E2E_PLAYOUT.inputs.inputs, PLAYLIST, UNAVAILABLE_PLAYLIST],
    },
  },
});

test('Station setup lists playlist outputs before other inputs', async ({ app }) => {
  await app.openStationSetupAt('Live sources');
  const dialog = app.page.getByRole('dialog', { name: 'Station setup' });
  const rows = dialog
    .getByRole('region', { name: 'Inputs from the Playout' })
    .locator('[data-source-input]');
  await expect(rows.locator('.cg-resource__name')).toHaveText([
    PLAYLIST.name,
    UNAVAILABLE_PLAYLIST.name,
    ...E2E_PLAYOUT.inputs.inputs.map((input) => PlayoutInputSchema.parse(input).name),
  ]);
  await expect(rows.nth(1).getByText('Unavailable', { exact: true })).toBeVisible();
});

const REASON = 'Programme sound is already on air';
const PICKER_TEMPLATE = 'tpl-playlist-picker';

test('the playlist output leads Inputs under the Playout’s name; bound to a plate, its audio is LOCKED at 0 — control: the plate beside it keeps its controls', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  // Owner follow-up, 2026-10-26 — the high-value Playlist source leads the picker even though D10
  // lists it after the ordinary inputs. This is presentation order only; the catalogue keeps D10 order.
  await page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'playlist-picker',
        sourceFileName: 'playlist-picker.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [
            {
              elementId: 'picker-plate',
              sourceId: 'guest-1',
              rect: { x: 0, y: 0, width: 640, height: 360 },
              dynamic: false,
            },
          ],
        },
      },
      html: '<!doctype html><html><body>playlist picker</body></html>',
    });
  }, PICKER_TEMPLATE);
  const pickerRow = await app.loadTemplate(PICKER_TEMPLATE);
  await app.selectLayerRow(pickerRow);
  await app.inspector.locator('[data-open-template-defaults]').click();
  const defaults = page.getByRole('dialog', { name: 'Source defaults' });
  await expect(defaults).toBeVisible();
  await defaults.locator('[data-defaults-select="guest-1"]').click();
  const picker = page.getByRole('dialog', { name: 'Choose a source' });
  await expect(picker.locator('[data-picker-input]').first()).toHaveAttribute(
    'data-picker-input',
    'in-pl-apasai',
  );
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await defaults.getByRole('button', { name: 'Cancel' }).click();

  // Bind the seeded row's first plate to the playlist output, as its template's default.
  const bound = await page.evaluate(async () => {
    const w = window as unknown as {
      cg: {
        stack: { snapshot: () => Promise<{ itemId: string; templateId: string }[]> };
        sources: { setAssignments: (req: unknown) => Promise<{ ok: boolean; reason?: string }> };
      };
    };
    const row = (await w.cg.stack.snapshot()).find((r) => r.itemId === 'item-irib-news');
    if (row === undefined) return { ok: false, reason: 'no seeded row' };
    return w.cg.sources.setAssignments({
      assignments: [{ templateId: row.templateId, plateId: 'guest-1', sourceId: 'in-pl-apasai' }],
    });
  });
  expect(bound, JSON.stringify(bound)).toMatchObject({ ok: true });

  await app.liveSourcesTab.click();
  const box = app.liveSourceRow('1-60');
  await expect(box).toBeVisible();
  const strip = box.locator('[data-plate-audio="guest-1"]');
  await expect(strip.locator('.cg-plate-pill-label')).toHaveText('Locked · 0');
  await expect(strip.locator('input[type="range"]')).toBeDisabled();
  await expect(strip.locator('input[type="range"]')).toHaveAttribute('title', REASON);
  for (const label of ['ON', 'OFF', 'SOLO']) {
    const button = strip.getByRole('button', {
      name: new RegExp(label === 'ON' ? '^Full volume' : label === 'OFF' ? '^Silence' : '^Solo'),
    });
    await expect(button, label).toBeDisabled();
    await expect(button, label).toHaveAttribute('title', REASON);
  }
  const shotPath = test.info().outputPath('c-1-locked-audio-pill.png');
  await box.screenshot({ path: shotPath });
  await test.info().attach('c-1-locked-audio-pill', { path: shotPath, contentType: 'image/png' });

  // CONTROL — the held plate beside it is not the playlist output: its controls are live.
  const other = app.liveSourceRow('1-61').locator('[data-plate-audio="guest-2"]');
  await expect(other.locator('input[type="range"]')).toBeEnabled();
  await expect(other.locator('.cg-plate-pill-label')).not.toHaveText('Locked · 0');
});

const audioLocales = [
  {
    language: 'fa',
    title: 'صدای قاب‌های زنده',
    close: 'بستن',
    volume: 'سطح صدا',
    locked: 'قفل · 0',
    unseated: 'تخصیص داده نشده',
    lockedReason: 'صدای برنامه از قبل روی آنتن است',
    unseatedReason: 'هنوز لایه‌ای به این قاب اختصاص داده نشده است.',
  },
  {
    language: 'ar',
    title: 'صوت الإطارات الحية',
    close: 'إغلاق',
    volume: 'مستوى الصوت',
    locked: 'مقفل · 0',
    unseated: 'بلا طبقة مخصَّصة',
    lockedReason: 'يُبثّ صوت البرنامج بالفعل',
    unseatedReason: 'لم تُخصّص طبقة لهذا الإطار بعد.',
  },
] as const;

for (const locale of audioLocales) {
  test(
    'audio dialog aligns the fader, value and actions in ' + locale.language,
    async ({ app }) => {
      const { page } = app;
      await page.setViewportSize({ width: 1440, height: 900 });
      const bound = await page.evaluate(async () => {
        const row = (await window.cg.stack.snapshot()).find(
          ({ itemId }) => itemId === 'item-looks',
        );
        if (row === undefined) throw new Error('The source fixture is missing its preset row');
        return window.cg.sources.setAssignments({
          assignments: [
            { templateId: row.templateId, plateId: 'live-1', sourceId: 'in-pl-apasai' },
          ],
        });
      });
      expect(bound).toMatchObject({ ok: true });

      await app.openStationSetupAt('General');
      await page.locator('#cg-interface-language').selectOption(locale.language);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: locale.close, exact: true })
        .click();
      await page.locator('[data-layer-list] [data-layer="99"] [data-row-audio]').click();

      const dialog = page.getByRole('dialog', { name: locale.title });
      await expect(dialog).toHaveCSS('direction', 'rtl');
      await expect(dialog.locator('.cg-audio-head')).toContainText(locale.volume);
      const locked = dialog.locator('[data-audio-plate="live-1"]');
      const unlocked = dialog.locator('[data-audio-plate="live-2"]');
      await expect(locked.locator('.cg-audio-state')).toHaveText(locale.locked);
      await expect(locked.getByRole('slider')).toBeDisabled();
      await expect(locked.getByRole('slider')).toHaveAttribute('title', locale.lockedReason);
      await expect(locked.getByRole('button').first()).toHaveAttribute(
        'title',
        locale.lockedReason,
      );
      await expect(unlocked.locator('.cg-audio-state')).toHaveText(locale.unseated);
      await expect(unlocked.locator('.cg-audio-state')).toHaveAttribute(
        'title',
        new RegExp('^' + locale.unseatedReason.replace(/\.$/, '\\.')),
      );
      await expect(unlocked.getByRole('slider')).toBeEnabled();

      const measures = await unlocked.evaluate((row) => {
        const centerY = (selector: string): number => {
          const element = row.querySelector(selector);
          if (element === null) throw new Error('Missing mixer control: ' + selector);
          const rect = element.getBoundingClientRect();
          return rect.y + rect.height / 2;
        };
        return {
          slider: centerY('input[type="range"]'),
          percent: centerY('.cg-audio-readout'),
          actions: centerY('.cg-audio-verbs'),
          source: centerY('.cg-audio-source'),
          status: centerY('.cg-audio-state'),
        };
      });
      expect(Math.abs(measures.slider - measures.percent)).toBeLessThan(1);
      expect(Math.abs(measures.slider - measures.actions)).toBeLessThan(1);
      expect(Math.abs(measures.slider - measures.source)).toBeLessThan(1);
      expect(measures.status).toBeGreaterThan(measures.slider);

      const close = dialog.locator('.cg-audio-close');
      const closeOffset = await close.evaluate((button) => {
        const label = button.querySelector('span');
        if (label === null) throw new Error('Missing audio close label');
        const frame = button.getBoundingClientRect();
        const text = label.getBoundingClientRect();
        return Math.abs(frame.y + frame.height / 2 - (text.y + text.height / 2));
      });
      expect(closeOffset).toBeLessThan(1);
      await close.click();
      await expect(dialog).toHaveCount(0);
    },
  );
}
