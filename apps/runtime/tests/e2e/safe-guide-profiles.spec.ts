import { readFile } from 'node:fs/promises';
import { createBridge } from '@cg/caspar-bridge';
import { LayerProfileSchema } from '@cg/shared-ipc';
import { expect, test } from '@playwright/test';

test('PVW and New live layout share visibility and edits, and Profiles restores their display preferences', async ({
  page,
}) => {
  const bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } },
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript((url) => {
      Object.assign(window, { __CG_BRIDGE_URL__: url, __CG_SPLASH_DISABLED__: true });
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    }, bridge.url);
    await page.goto('/');
    await page.getByRole('button', { name: 'Show monitors', exact: true }).click();
    const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
    const pvwToggle = pvw.getByRole('button', { name: 'Safe areas in Preview', exact: true });
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'false');
    const editor = page.getByRole('dialog', { name: 'New live layout', exact: true });
    const openEditor = async () => {
      await page.getByRole('button', { name: 'New live layout', exact: true }).click();
      await expect(editor).toBeVisible();
    };
    await openEditor();
    const editorToggle = editor.getByRole('button', { name: 'Safe areas', exact: true });
    await expect(editorToggle).toHaveAttribute('aria-pressed', 'false');
    await editorToggle.click();
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(pvw.locator('[data-safe-area-guides]')).toHaveCount(1);
    await editor.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
    await settings.getByLabel('Guide color', { exact: true }).fill('#22aaee');
    await settings.getByRole('button', { name: 'Add horizontal guide', exact: true }).click();
    await settings.getByRole('textbox', { name: 'Guide 1 name', exact: true }).fill('Shared title');
    await settings
      .getByRole('textbox', { name: 'Guide 1 position percent', exact: true })
      .fill('25');
    await settings
      .getByRole('textbox', { name: 'Guide 1 position percent', exact: true })
      .press('Tab');
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await expect(pvw.locator('[data-guide-axis="y"]')).toHaveAttribute('y1', '270');
    await expect(pvw.locator('[data-guide-axis="y"]')).toHaveCSS('stroke', 'rgb(34, 170, 238)');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await pvwToggle.click();
    await openEditor();
    await expect(editorToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(editor.locator('[data-safe-area-guides]')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();

    // An edit in the other direction also enables both views immediately.
    await pvw.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await settings.getByRole('textbox', { name: 'Guide 1 name', exact: true }).fill('Saved title');
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await openEditor();
    await expect(editorToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(
      editor.locator('[data-safe-area-guides]').getByText('Saved title', { exact: true }),
    ).toHaveCount(1);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();

    const profilesButton = page.getByRole('button', { name: 'Layer profiles', exact: true });
    const profiles = page.getByRole('dialog', { name: 'Layer profiles', exact: true });
    await profilesButton.click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      profiles.getByRole('button', { name: 'Save profile…' }).click(),
    ]);
    const savedPath = await download.path();
    if (savedPath === null) throw new Error('Missing saved profile');
    const saved = JSON.parse(await readFile(savedPath, 'utf8')) as Record<string, unknown>;
    expect(LayerProfileSchema.parse(saved)).toMatchObject({
      kind: 'apasai-cg-layer-profile',
      version: 1,
      items: [],
    });
    expect(saved.safeGuides).toMatchObject({
      visible: true,
      color: '#22aaee',
      lines: [{ name: 'Saved title', position: 25 }],
    });
    await profiles.getByRole('button', { name: 'Close', exact: true }).click();
    await pvw.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await settings
      .getByRole('textbox', { name: 'Guide 1 name', exact: true })
      .fill('Different title');
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await pvwToggle.click();

    // Record the request passed to the real Bridge: the view-only extension stays in this browser.
    await page.evaluate(() => {
      const load = window.cg.stack.loadProfile;
      const state = window as unknown as { __profileRequest: unknown };
      window.cg.stack.loadProfile = (request) => {
        state.__profileRequest = request;
        return load(request);
      };
    });
    const loadProfile = async (value: unknown, refused = false) => {
      await profilesButton.click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        profiles.getByRole('button', { name: 'Choose profile…', exact: true }).click(),
      ]);
      await chooser.setFiles({
        name: 'guides-profile.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(value)),
      });
      await profiles.getByRole('button', { name: 'Load profile', exact: true }).click();
      if (!refused) await expect(profiles).toHaveCount(0);
    };
    await loadProfile(saved);
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(
      pvw.locator('[data-safe-area-guides]').getByText('Saved title', { exact: true }),
    ).toHaveCount(1);
    const request = await page.evaluate(
      () => (window as unknown as { __profileRequest: { profile: unknown } }).__profileRequest,
    );
    expect(request.profile).toEqual(LayerProfileSchema.parse(saved));
    await openEditor();
    await expect(editorToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(
      editor.locator('[data-safe-area-guides]').getByText('Saved title', { exact: true }),
    ).toHaveCount(1);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();

    await pvwToggle.click();
    // A refused layer-profile load must not change this browser's shared view state either.
    await page.evaluate(() => {
      const state = window as unknown as {
        __loadBeforeRefusal: typeof window.cg.stack.loadProfile;
      };
      state.__loadBeforeRefusal = window.cg.stack.loadProfile;
      window.cg.stack.loadProfile = () =>
        Promise.resolve({ loaded: 0, issues: [], refusal: 'on-air' });
    });
    await loadProfile(saved, true);
    await expect(
      profiles.getByText('Stop the graphics on this channel before loading a profile.'),
    ).toBeVisible();
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'false');
    await profiles.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => {
      window.cg.stack.loadProfile = (
        window as unknown as { __loadBeforeRefusal: typeof window.cg.stack.loadProfile }
      ).__loadBeforeRefusal;
    });
    const { safeGuides: _guides, ...legacy } = saved;
    await loadProfile(legacy);
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'false');
    await loadProfile({ ...legacy, safeGuides: { version: 99, visible: true } });
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await page.getByRole('button', { name: 'Show monitors', exact: true }).click();
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'false');
    await openEditor();
    await expect(editorToggle).toHaveAttribute('aria-pressed', 'false');
    await editor.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await expect(settings.getByRole('textbox', { name: 'Guide 1 name', exact: true })).toHaveValue(
      'Saved title',
    );
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await pvw.screenshot({ path: test.info().outputPath('shared-guide-profile-restored.png') });
  } finally {
    await bridge.close();
  }
});
