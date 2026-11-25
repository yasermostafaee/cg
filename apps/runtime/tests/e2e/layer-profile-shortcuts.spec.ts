import { readFile } from 'node:fs/promises';
import { createBridge } from '@cg/caspar-bridge';
import { LayerProfileSchema, type FixedLayerBank, type LayerProfile } from '@cg/shared-ipc';
import { CONTROL_LANGUAGE_KEY } from '../../src/renderer/i18n/localePreferences.js';
import { expect, test } from './fixtures/runtime.js';

const bank: FixedLayerBank = {
  channel: 1,
  start: 80,
  count: 20,
  low: { start: 50, count: 10 },
  shortcuts: { '98': { play: 'F3' } },
  nextShortcuts: { '98': 'Alt+F3' },
  spaceShortcut: { layer: 99, verb: 'clear' },
};

function createProfileBridge() {
  return createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: bank,
  });
}

test('R-024 saves and restores channel shortcuts and reports a Bridge without shortcut restore', async ({
  page,
}) => {
  const bridge = await createProfileBridge();
  try {
    await page.addInitScript((url) => {
      const testWindow = window as unknown as {
        __CG_BRIDGE_URL__: string;
        __CG_SPLASH_DISABLED__: boolean;
      };
      testWindow.__CG_BRIDGE_URL__ = url;
      testWindow.__CG_SPLASH_DISABLED__ = true;
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    }, bridge.url);
    await page.goto('/');
    const profiles = page.getByRole('button', { name: 'Layer profiles', exact: true });
    await profiles.click();
    const dialog = page.getByRole('dialog', { name: 'Layer profiles', exact: true });
    const save = dialog.getByRole('button', { name: 'Save profile…' });
    const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
    const downloaded = await download.path();
    if (downloaded === null) throw new Error('Missing profile download');
    const profile = LayerProfileSchema.parse(JSON.parse(await readFile(downloaded, 'utf8')));
    expect(profile.layerShortcuts).toEqual({
      shortcuts: bank.shortcuts,
      nextShortcuts: bank.nextShortcuts,
      spaceShortcut: bank.spaceShortcut,
    });

    const load = async (value: LayerProfile): Promise<void> => {
      if (!(await dialog.isVisible())) await profiles.click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        dialog.getByRole('button', { name: 'Choose profile…', exact: true }).click(),
      ]);
      await chooser.setFiles({
        name: 'keyboard-profile.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(value)),
      });
      await expect(dialog.getByText('This profile includes keyboard shortcuts.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Load profile', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };
    const currentBank = () => bridge.runtime.fixedLayerBanks()[0];
    const empty = { shortcuts: {}, nextShortcuts: {}, spaceShortcut: null };
    expect(bridge.runtime.setFixedLayerBanks([{ ...bank, ...empty }])).toEqual({ ok: true });
    expect(currentBank()).toMatchObject(empty);

    await load(profile);
    await expect(page.getByRole('status', { name: 'Command success' })).toHaveText(
      'Loaded 0 layers.',
    );
    expect(currentBank()).toMatchObject(bank);

    await load({ ...profile, layerShortcuts: { shortcuts: { '79': { play: 'F3' } } } });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Shortcuts skipped. Layer is not in the bank' }),
    ).toBeVisible();
    expect(currentBank()).toMatchObject(bank);

    await page.evaluate(() => {
      const loadProfile = window.cg.stack.loadProfile;
      // A prior Bridge strips the new profile field at its route parser.
      window.cg.stack.loadProfile = ({
        channel,
        profile: { layerShortcuts: _ignored, ...legacy },
      }) => loadProfile({ channel, profile: legacy });
    });
    await load({ ...profile, layerShortcuts: empty });
    await expect(
      page.getByRole('alert').filter({
        hasText: 'Loaded 0 layers. Shortcuts skipped. This CG Bridge cannot restore them.',
      }),
    ).toBeVisible();
    expect(currentBank()).toMatchObject(bank);
  } finally {
    await bridge.close();
  }
});

const englishProfileDialog = ['Layer profiles', 'Choose profile…', 'Load profile'] as const;
const englishWarning = [
  'Loaded 2 layers.',
  'Layer 99 · Logo — Clear this layer before replacing it with a profile. Layer 98 · زیرنویس — Clear this layer before replacing it with a profile.',
] as const;

const profileLanguages = [
  { ui: 'en', feedback: 'en', dir: 'ltr', dialog: englishProfileDialog, warning: englishWarning },
  {
    ui: 'fa',
    feedback: 'en',
    dir: 'ltr',
    dialog: ['پروفایل‌های لایه', 'انتخاب پروفایل…', 'بارگذاری پروفایل'],
    warning: englishWarning,
  },
  {
    ui: 'en',
    feedback: 'fa',
    dir: 'rtl',
    dialog: englishProfileDialog,
    warning: [
      '2 لایه بارگذاری شد.',
      'لایهٔ 99 · Logo — پیش از جایگزینی با پروفایل، این لایه را پاک کنید. لایهٔ 98 · زیرنویس — پیش از جایگزینی با پروفایل، این لایه را پاک کنید.',
    ],
  },
  {
    ui: 'en',
    feedback: 'ar',
    dir: 'rtl',
    dialog: englishProfileDialog,
    warning: [
      'تم تحميل 2 من الطبقات.',
      'الطبقة 99 · Logo — امسح هذه الطبقة قبل استبدالها بملف تعريف. الطبقة 98 · زیرنویس — امسح هذه الطبقة قبل استبدالها بملف تعريف.',
    ],
  },
] as const;

for (const { ui, feedback, dir, dialog, warning } of profileLanguages) {
  test(`B-455 profile load warning follows ${feedback} feedback in the ${ui} interface`, async ({
    page,
  }) => {
    const bridge = await createProfileBridge();
    try {
      await page.addInitScript(
        ({ key, ui, feedback, url }) => {
          (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = url;
          localStorage.setItem(key, JSON.stringify({ interface: ui, feedback }));
        },
        { key: CONTROL_LANGUAGE_KEY, ui, feedback, url: bridge.url },
      );
      await page.goto('/');

      const [profilesName, chooseName, loadName] = dialog;
      await page.getByRole('button', { name: profilesName, exact: true }).click();
      const modal = page.getByRole('dialog', { name: profilesName, exact: true });
      await page.evaluate(() => {
        window.cg.stack.loadProfile = async () => ({
          loaded: 2,
          issues: [
            { layer: 99, label: 'Logo', reason: 'layer-occupied' },
            { layer: 98, label: 'زیرنویس', reason: 'layer-occupied' },
          ],
        });
      });
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        modal.getByRole('button', { name: chooseName, exact: true }).click(),
      ]);
      await chooser.setFiles({
        name: 'profile.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({ kind: 'apasai-cg-layer-profile', version: 1, items: [] }),
        ),
      });
      await modal.getByRole('button', { name: loadName, exact: true }).click();
      await expect(modal).toHaveCount(0);

      const lines = page.locator('[data-refusal] [data-notice="refusal"] span[dir]');
      await expect(lines).toHaveCount(2);
      for (const [index, copy] of warning.entries()) {
        const line = lines.nth(index);
        await expect(line).toHaveCSS('direction', dir);
        const { text, offset } = await line.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const textBounds = range.getBoundingClientRect();
          const lineBounds = element.getBoundingClientRect();
          const rtl = getComputedStyle(element).direction === 'rtl';
          return {
            text: element.textContent?.replace(/[\u2066-\u2069]/gu, ''),
            offset: rtl ? lineBounds.right - textBounds.right : textBounds.left - lineBounds.left,
          };
        });
        expect(text).toBe(copy);
        expect(Math.abs(offset)).toBeLessThan(1);
      }
    } finally {
      await bridge.close();
    }
  });
}
