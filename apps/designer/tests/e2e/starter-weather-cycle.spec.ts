import { expect, test } from './fixtures/designer.js';

test('province weather shows every city once, dwells on the final page and fades out automatically', async ({
  app,
}) => {
  test.setTimeout(60_000);
  await app.page.getByTestId('starter-card').filter({ hasText: 'آب‌وهوای مراکز استان‌ها' }).click();
  await app.expectStudio();
  await app.openPreviewModal();
  await app.play();
  await expect(app.previewElement('weather-pages-hint')).toHaveCount(0);
  const handle = await app.previewDialog.locator('iframe').elementHandle();
  const frame = await handle?.contentFrame();
  if (frame === undefined || frame === null) throw new Error('No weather Preview frame');
  const result = await frame.evaluate(async () => {
    const sequence = document.querySelector('[data-cg-element-id="weather-pages-sequence"]');
    const photo = document.querySelector('[data-cg-element-id="weather-pages-photo-bg"]');
    const panel = document.querySelector('[data-cg-element-id="weather-pages-bg"]');
    if (sequence === null || photo === null || panel === null)
      throw new Error('Missing weather elements');
    const pages: string[][] = [];
    const leads: string[] = [];
    let sawPageCounter = false;
    let finalPageAt: number | null = null;
    let finalPageLastSeenAt: number | null = null;
    let photoFaded = false;
    let panelFaded = false;
    let photoFullOpacity = 0;
    let panelFullOpacity = 0;
    let finalPageGone = false;
    let finalPageReappeared = false;
    let backgroundFadedBeforeFinalPageExit = false;
    const until = performance.now() + 42_000;
    while (performance.now() < until) {
      if (document.body.classList.contains('cg-pending') && pages.length > 0) {
        return {
          pages,
          leads,
          sawPageCounter,
          photoFaded,
          panelFaded,
          finalPageGone,
          finalPageReappeared,
          backgroundFadedBeforeFinalPageExit,
          settled: true,
          finalPageVisibleMs: (finalPageLastSeenAt ?? 0) - (finalPageAt ?? 0),
        };
      }
      if (document.querySelector('[data-cg-element-id="weather-page-title"]') !== null)
        sawPageCounter = true;
      const active = [...sequence.querySelectorAll<HTMLElement>('[data-cg-sequence-item]')];
      const finalPageVisible = active.some((page) => {
        const names = [...page.querySelectorAll('[data-cg-element-id="weather-city"]')];
        if (names[0]?.textContent?.trim() !== 'کرمان') return false;
        if (
          Number(getComputedStyle(page).opacity) <= 0.001 ||
          getComputedStyle(page).visibility === 'hidden'
        )
          return false;
        return [...page.querySelectorAll<HTMLElement>('[data-cg-repeater-motion]')].some(
          (row) => row.style.visibility !== 'hidden' && Number(row.style.opacity || '1') > 0.001,
        );
      });
      if (pages.length === 4) {
        if (!finalPageVisible) finalPageGone = true;
        if (finalPageGone && finalPageVisible) finalPageReappeared = true;
      }
      for (const page of active) {
        const pageAlpha = Number(getComputedStyle(page).opacity);
        if (pageAlpha < 0.99 || getComputedStyle(page).visibility === 'hidden') continue;
        const names = [...page.querySelectorAll('[data-cg-element-id="weather-city"]')].map(
          (node) => node.textContent?.trim() ?? '',
        );
        if (names.length === 0) continue;
        const first = names[0]!;
        if (leads.at(-1) !== first) leads.push(first);
        if (first === 'کرمان') {
          finalPageAt ??= performance.now();
          finalPageLastSeenAt = performance.now();
        }
        const rows = [...page.querySelectorAll<HTMLElement>('[data-cg-repeater-motion]')];
        const allRowsVisible =
          rows.length === names.length &&
          rows.every(
            (row) => row.style.visibility !== 'hidden' && Number(row.style.opacity || '1') >= 0.999,
          );
        if (allRowsVisible && !pages.some((previous) => previous[0] === first)) pages.push(names);
      }
      const photoAlpha = Number(getComputedStyle(photo).opacity);
      const panelAlpha = Number(getComputedStyle(panel).opacity);
      photoFullOpacity = Math.max(photoFullOpacity, photoAlpha);
      panelFullOpacity = Math.max(panelFullOpacity, panelAlpha);
      if (pages.length === 4) {
        if (photoAlpha > 0 && photoAlpha < photoFullOpacity * 0.99) {
          photoFaded = true;
          if (!finalPageGone) backgroundFadedBeforeFinalPageExit = true;
        }
        if (panelAlpha > 0 && panelAlpha < panelFullOpacity * 0.99) {
          panelFaded = true;
          if (!finalPageGone) backgroundFadedBeforeFinalPageExit = true;
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return {
      pages,
      leads,
      sawPageCounter,
      photoFaded,
      panelFaded,
      finalPageGone,
      finalPageReappeared,
      backgroundFadedBeforeFinalPageExit,
      settled: false,
      finalPageVisibleMs: (finalPageLastSeenAt ?? 0) - (finalPageAt ?? 0),
    };
  });
  expect(result.pages).toEqual([
    ['اراک', 'اردبیل', 'ارومیه', 'اصفهان', 'اهواز', 'ایلام', 'بجنورد', 'بندرعباس'],
    ['بوشهر', 'بیرجند', 'تبریز', 'تهران', 'خرم‌آباد', 'رشت', 'زاهدان', 'زنجان'],
    ['ساری', 'سمنان', 'سنندج', 'شهرکرد', 'شیراز', 'قزوین', 'قم', 'کرج'],
    ['کرمان', 'کرمانشاه', 'گرگان', 'مشهد', 'همدان', 'یاسوج', 'یزد'],
  ]);
  expect(result.leads).toEqual(['اراک', 'بوشهر', 'ساری', 'کرمان']);
  expect(result.sawPageCounter).toBe(false);
  expect(result.finalPageVisibleMs).toBeGreaterThanOrEqual(6_000);
  expect(result.photoFaded).toBe(true);
  expect(result.panelFaded).toBe(true);
  expect(result.finalPageGone).toBe(true);
  expect(result.finalPageReappeared).toBe(false);
  expect(result.backgroundFadedBeforeFinalPageExit).toBe(false);
  expect(result.settled).toBe(true);
});
