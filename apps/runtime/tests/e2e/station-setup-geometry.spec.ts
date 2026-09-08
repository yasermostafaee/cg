import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **Station setup measures to the reference
 * as RENDERED, read back from the token home — in a real engine.**
 *
 * `09-channel-settings.html` was measured in Chromium at 1280 × 800 with the dialog opened by
 * the page's own `data-start="channels"` (`design.md` §14.3): a `min(1140px, 100vw − 64px)` ×
 * `min(810px, 100vh − 64px)` frame, a 90 px head carrying a channel subtitle, a 226 px rail of
 * 44 px icon tabs, a pane inset 29/32, a 74 px footer, and a Channel pane built from a video-format
 * card and an Outputs block. Every number below is READ from the token home (`--r-setup-*`,
 * `--r-modal-*`) and compared against what the page paints, so a token that stops being read
 * fails here rather than passing on a coincidence.
 *
 * ⚠ Geometry belongs in Playwright (golden rule 12c / `B-242`): jsdom has no layout, so a dom
 * spec asserting any of these boxes compares zeros. `station-setup-frame.spec.ts` keeps the
 * TWO-EDGE property (one box on every tab, the footer's top edge still); this file asserts what
 * the box IS.
 */

const px = (v: string): number => Number.parseFloat(v);

test('§7 — the frame, the rail, the pane and the footer measure to the token home at 1280 × 800', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      railW: read('--r-setup-rail-w'),
      tabMinH: read('--r-setup-tab-min-h'),
      panePad: read('--r-setup-pane-pad'),
      footH: read('--r-modal-foot-h'),
      footPad: read('--r-modal-foot-pad-fixed'),
      headMinH: read('--r-modal-head-min-h-fixed'),
      subtitleText: read('--r-modal-subtitle-text'),
      titleText: read('--r-setup-title-text'),
      cardRadius: read('--r-setup-card-radius'),
    };
  });

  // THE FRAME — the reference's 1140 × min(810, 800 − 64) = 736 at this viewport.
  const frame = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(frame).toEqual({ w: 1140, h: 736 });
  // POSITIVE CONTROL: the abandoned mockup's frame was 1000 × 680; a page still painting it
  // could not pass the line above, and neither could a dialog that failed to render.
  expect(frame.w).toBeGreaterThan(1000);

  // THE HEAD — its floor, and the subtitle naming the channel this dialog reports.
  const head = await dialog.evaluate((el) => {
    const first = el.firstElementChild;
    if (first === null) throw new Error('the dialog has no head');
    const sub = el.querySelector('[data-modal-subtitle]');
    return {
      h: first.getBoundingClientRect().height,
      subtitle: sub?.textContent ?? '',
      subtitleText: sub === null ? '' : getComputedStyle(sub).fontSize,
    };
  });
  expect(head.h).toBeGreaterThanOrEqual(px(tokens.headMinH));
  expect(head.subtitle).toContain('Channel 1');
  expect(head.subtitle).toContain('Primary A');
  expect(px(head.subtitleText)).toBe(px(tokens.subtitleText));

  // THE RAIL — its width, and a tab's height, from the tokens; each tab wears its glyph.
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });
  expect(Math.round(await rail.evaluate((el) => el.getBoundingClientRect().width))).toBe(
    px(tokens.railW),
  );
  const tab = rail.getByRole('tab', { name: /^Channel/ });
  expect(Math.round(await tab.evaluate((el) => el.getBoundingClientRect().height))).toBe(
    px(tokens.tabMinH),
  );
  await expect(rail.locator('.cg-rail-tab > svg')).toHaveCount(5);

  // THE PANE — inset `29px 32px 32px`.
  const pane = dialog.locator('[data-station-pane]');
  const [padTop, padX, padBottom] = tokens.panePad.split(' ').map(px);
  const paneStyle = await pane.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: cs.paddingTop, left: cs.paddingLeft, bottom: cs.paddingBottom };
  });
  expect(px(paneStyle.top)).toBe(padTop);
  expect(px(paneStyle.left)).toBe(padX);
  expect(px(paneStyle.bottom)).toBe(padBottom);

  // THE SECTION HEAD — a 24 px title, and the contract tag beside it.
  const title = dialog.locator('.cg-setup-title');
  await expect(title).toHaveText('Channel');
  expect(px(await title.evaluate((el) => getComputedStyle(el).fontSize))).toBe(
    px(tokens.titleText),
  );
  await expect(dialog.locator('[data-section-commit="read-only"]')).toHaveText('Read only');

  // THE FOOTER — a 74 px FLOOR, `15px 32px`, on the Channel tab (which puts no button in it).
  const foot = await dialog.locator('.cg-modal-footer').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, minH: cs.minHeight, padLeft: cs.paddingLeft };
  });
  expect(Math.round(foot.h)).toBe(px(tokens.footH));
  expect(px(foot.minH)).toBe(px(tokens.footH));
  expect(px(foot.padLeft)).toBe(px(tokens.footPad.split(' ')[1] ?? ''));

  // A CARD — radius 12, from the token.
  const card = dialog.getByRole('region', { name: 'Video format', exact: true });
  expect(px(await card.evaluate((el) => getComputedStyle(el).borderRadius))).toBe(
    px(tokens.cardRadius),
  );
});

test('§7 — the Channel pane is the video-format card and the Outputs block, keyed to CH 01', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();

  const card = dialog.getByRole('region', { name: 'Video format', exact: true });
  await expect(card).toHaveAttribute('data-raster-channel', '1');
  await expect(card.locator('.cg-video-token')).toHaveText('CH 01');
  // The mock's mode is `1080i5000`: the word, the scan, and the rate as both halves.
  await expect(card.locator('[data-video-mode-word]')).toHaveText('1080i');
  await expect(card.locator('.cg-video-mode__scan')).toHaveText('Interlaced');
  const metrics = card.locator('.cg-video-metric');
  await expect(metrics.nth(0)).toContainText('Resolution');
  await expect(metrics.nth(0)).toContainText('1920 × 1080');
  await expect(metrics.nth(1)).toContainText('Frame rate');
  await expect(metrics.nth(1)).toContainText('25 fps · 50 fields/s');
  await expect(metrics.nth(2)).toContainText('Server mode');
  await expect(metrics.nth(2)).toContainText('1080i5000');
  // …and the app's own two facts the reference does not draw (the deletion guard keeps them).
  await expect(metrics.nth(3)).toContainText('Declared by');
  await expect(metrics.nth(4)).toContainText('Check');
  await expect(metrics.nth(4)).toContainText('agrees with the server');

  // The mode word is the reference's 46 px rank, from the token.
  const modeText = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--r-video-mode-text').trim(),
  );
  expect(
    px(
      await card.locator('[data-video-mode-word]').evaluate((el) => getComputedStyle(el).fontSize),
    ),
  ).toBe(px(modeText));

  // The Outputs block heads the same pane. The offline mock publishes no output check, so the
  // block says so for THIS channel rather than drawing an empty table.
  const outputs = dialog.getByRole('region', { name: 'Program outputs', exact: true });
  await expect(outputs.locator('h3')).toHaveText('Outputs');
  await expect(outputs).toContainText('no output check has completed yet for channel 1');
  await expect(outputs.locator('[data-output-table]')).toHaveCount(0);

  // The channel strip outside the dialog is the same one channel, selected.
  await page.keyboard.press('Escape');
  const strip = page.getByRole('tablist', { name: 'Channels' });
  await expect(strip.getByRole('tab')).toHaveCount(1);
  await expect(strip.getByRole('tab', { name: 'CHANNEL 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
