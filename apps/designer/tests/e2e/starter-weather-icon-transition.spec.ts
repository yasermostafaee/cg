import { expect, test } from './fixtures/designer.js';

for (const title of ['آب‌وهوای مراکز استان‌ها', 'آب‌وهوای شهرها — کارت‌های تصویری']) {
  test(`animated weather icons stay anchored while ${title} changes page`, async ({ app }) => {
    await app.page.setViewportSize({ width: 1600, height: 1000 });
    await app.page.getByTestId('starter-card').filter({ hasText: title }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    await app.play();

    const sequence = app.previewElement('weather-pages-sequence');
    const outgoingPage = sequence
      .locator('[data-cg-sequence-item]')
      .filter({ visible: true })
      .first();
    const icon = outgoingPage
      .locator('[data-cg-element-id="weather-icon"]')
      .filter({ visible: true })
      .first();
    await expect(icon).toBeVisible();
    // Let the authored row entrance settle before isolating the page-turn motion.
    await app.page.waitForTimeout(1_300);
    const before = await icon.boundingBox();
    const source = await icon.getAttribute('src');
    if (before === null || source === null)
      throw new Error('The first weather icon did not render');

    // Animated composition pages are mounted and allowed to settle before their first turn. Mark
    // those exact DOM nodes: page 2/3/4 must reveal these nodes, not rebuild fresh SVG documents.
    const allPages = sequence.locator('[data-cg-sequence-item]');
    const warmed = await allPages.evaluateAll((pages) =>
      pages.map((page, index) => {
        const token = `weather-warm-${String(index)}`;
        (page as HTMLElement).dataset['weatherWarmTest'] = token;
        const warmedIcon = page.querySelector<HTMLElement>('[data-cg-element-id="weather-icon"]');
        const rect = warmedIcon?.getBoundingClientRect();
        return {
          token,
          source: warmedIcon?.getAttribute('src') ?? '',
          rect:
            rect === undefined
              ? null
              : { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }),
    );
    expect(warmed.length).toBeGreaterThanOrEqual(4);
    expect(warmed.every((page) => page.source !== '' && page.rect !== null)).toBe(true);

    await app.next();
    await expect(allPages).toHaveCount(warmed.length);
    const incomingPage = sequence.locator(`[data-weather-warm-test="${warmed[1]?.token ?? ''}"]`);
    expect(await incomingPage.evaluate((node) => getComputedStyle(node).visibility)).toBe('hidden');
    await app.page.waitForTimeout(300);
    const during = await icon.boundingBox();
    if (during === null)
      throw new Error('The outgoing weather icon vanished before its fade ended');

    // The animated SVG keeps its source and its painted anchor. The page may dissolve, but a short
    // horizontal drift makes the icon look as though its own animation suddenly snapped backwards.
    expect(await icon.getAttribute('src')).toBe(source);
    expect(during.x).toBeCloseTo(before.x, 0);
    expect(during.y).toBeCloseTo(before.y, 0);

    // Fade-through deliberately keeps the newly mounted animated SVG hidden during the outgoing
    // half. Its own animation therefore has time to start before it can become visible, instead of
    // cross-fading a fresh frame zero over the old icon and looking like a fast snap backwards.
    await app.page.waitForTimeout(450);
    await expect(incomingPage).toHaveCSS('visibility', 'visible');

    // Finish page 2, then walk through pages 3 and 4. Each reveal keeps the prewarmed node, source
    // and resting geometry, covering the owner's "page 2 onward" reproduction directly.
    await app.page.waitForTimeout(550);
    for (let pageIndex = 1; pageIndex < Math.min(4, warmed.length); pageIndex += 1) {
      if (pageIndex > 1) {
        await app.next();
        await app.page.waitForTimeout(1_300);
      }
      const expected = warmed[pageIndex];
      if (expected === undefined || expected.rect === null)
        throw new Error(`Weather page ${String(pageIndex + 1)} was not prewarmed`);
      const page = sequence.locator(`[data-weather-warm-test="${expected.token}"]`);
      await expect(page).toBeVisible();
      const currentIcon = page.locator('[data-cg-element-id="weather-icon"]').first();
      const rect = await currentIcon.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      expect(await currentIcon.getAttribute('src')).toBe(expected.source);
      expect(rect.x).toBeCloseTo(expected.rect.x, 0);
      expect(rect.y).toBeCloseTo(expected.rect.y, 0);
    }
  });
}
