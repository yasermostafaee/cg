import { expect, test } from './fixtures/designer.js';

const originalPages = [
  ['اراک', 'اردبیل', 'ارومیه', 'اصفهان', 'اهواز', 'ایلام', 'بجنورد', 'بندرعباس'],
  ['بوشهر', 'بیرجند', 'تبریز', 'تهران', 'خرم‌آباد', 'رشت', 'زاهدان', 'زنجان'],
  ['ساری', 'سمنان', 'سنندج', 'شهرکرد', 'شیراز', 'قزوین', 'قم', 'کرج'],
  ['کرمان', 'کرمانشاه', 'گرگان', 'مشهد', 'همدان', 'یاسوج', 'یزد'],
];
const allCities = originalPages.flat();
const cardPages = Array.from({ length: 8 }, (_, index) =>
  allCities.slice(index * 4, index * 4 + 4),
);

test('B-414: the first painted weather page excludes rows from every prepared page', async ({
  app,
}) => {
  await app.page.getByTestId('starter-card').filter({ hasText: 'آب‌وهوای مراکز استان‌ها' }).click();
  await app.expectStudio();
  await app.openPreviewModal();
  const iframe = await app.previewDialog.locator('iframe').elementHandle();
  const frame = await iframe?.contentFrame();
  if (frame === undefined || frame === null) throw new Error('No weather Preview frame');
  const sample = (ms: number) =>
    frame.evaluate(async (duration) => {
      const painted = new Set<string>();
      const until = performance.now() + duration;
      do {
        for (const city of document.querySelectorAll('[data-cg-element-id="weather-city"]')) {
          // CSS visibility can be overridden by a descendant. Opacity is composited and
          // cannot: a child of a zero-opacity page never contributes pixels.
          if (
            getComputedStyle(city).visibility !== 'visible' ||
            city.getClientRects().length === 0
          ) {
            continue;
          }
          let visible = true;
          for (let node: Element | null = city; node !== null; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === 'none' || Number(style.opacity) <= 0.001) {
              visible = false;
              break;
            }
          }
          if (visible) painted.add(city.textContent?.trim() ?? '');
        }
        await new Promise(requestAnimationFrame);
      } while (performance.now() < until);
      return [...painted];
    }, ms);

  const pending = await sample(200);
  await app.play();
  const opening = await sample(2400);
  expect(pending).toEqual([]);
  expect(opening).toContain('اراک');
  expect(opening.filter((name) => !originalPages[0]!.includes(name))).toEqual([]);
});

for (const variant of [
  {
    name: 'province weather',
    label: 'آب‌وهوای مراکز استان‌ها',
    expectedPages: originalPages,
    timeoutMs: 60_000,
    observationMs: 42_000,
    inspectCards: false,
  },
  {
    name: 'portrait city weather cards',
    label: 'آب‌وهوای شهرها — کارت‌های تصویری',
    expectedPages: cardPages,
    // Eight natural 6500 ms dwells, page transitions and the authored outro exceed the
    // original four-page observation window. Keep the real timing, not a faster override.
    timeoutMs: 90_000,
    observationMs: 75_000,
    inspectCards: true,
  },
]) {
  test(`${variant.name} shows every city once, dwells on the final page and fades out automatically`, async ({
    app,
  }) => {
    test.setTimeout(variant.timeoutMs);
    await app.page.getByTestId('starter-card').filter({ hasText: variant.label }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    await app.play();
    await expect(app.previewElement('weather-pages-hint')).toHaveCount(0);
    const handle = await app.previewDialog.locator('iframe').elementHandle();
    const frame = await handle?.contentFrame();
    if (frame === undefined || frame === null) throw new Error('No weather Preview frame');
    const result = await frame.evaluate(
      async ({ pageCount, finalCity, observationMs, inspectCards }) => {
        const sequence = document.querySelector('[data-cg-element-id="weather-pages-sequence"]');
        const photo = document.querySelector('[data-cg-element-id="weather-pages-photo-bg"]');
        const panel = document.querySelector('[data-cg-element-id="weather-pages-bg"]');
        if (sequence === null || photo === null || panel === null)
          throw new Error('Missing weather elements');
        // Sequence pre-stamps page 1 before its content-start gate opens. That page and
        // its rows can have opacity=1 while the ancestor sequence is display:none, so
        // their own styles alone are not evidence that a viewer has seen the page.
        const isPainted = (node: HTMLElement, minimumOpacity: number): boolean => {
          if (!node.isConnected) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          for (
            let ancestor: HTMLElement | null = node;
            ancestor !== null;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              style.visibility === 'collapse' ||
              Number(style.opacity) < minimumOpacity
            )
              return false;
          }
          return true;
        };
        const pages: string[][] = [];
        const leads: string[] = [];
        const cardGeometry: { x: number; y: number; width: number; height: number }[][] = [];
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
        const until = performance.now() + observationMs;
        while (performance.now() < until) {
          if (document.body.classList.contains('cg-pending') && pages.length > 0) {
            return {
              pages,
              leads,
              cardGeometry,
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
            if (names[0]?.textContent?.trim() !== finalCity) return false;
            if (!isPainted(page, 0.001)) return false;
            return [...page.querySelectorAll<HTMLElement>('[data-cg-repeater-motion]')].some(
              (row) => isPainted(row, 0.001),
            );
          });
          if (pages.length === pageCount) {
            if (!finalPageVisible) finalPageGone = true;
            if (finalPageGone && finalPageVisible) finalPageReappeared = true;
          }
          for (const page of active) {
            if (!isPainted(page, 0.99)) continue;
            const names = [...page.querySelectorAll('[data-cg-element-id="weather-city"]')].map(
              (node) => node.textContent?.trim() ?? '',
            );
            if (names.length === 0) continue;
            const first = names[0]!;
            if (leads.at(-1) !== first) leads.push(first);
            if (first === finalCity) {
              finalPageAt ??= performance.now();
              finalPageLastSeenAt = performance.now();
            }
            const rows = [...page.querySelectorAll<HTMLElement>('[data-cg-repeater-motion]')];
            const allRowsVisible =
              rows.length === names.length && rows.every((row) => isPainted(row, 0.999));
            if (allRowsVisible && !pages.some((previous) => previous[0] === first)) {
              if (inspectCards) {
                const stage = document.querySelector('.cg-stage')?.getBoundingClientRect();
                if (stage === undefined || stage.width <= 0 || stage.height <= 0)
                  throw new Error('Missing weather stage geometry');
                const cards = rows.map((row) => {
                  const matches = row.querySelectorAll<HTMLElement>(
                    '[data-cg-element-id="weather-row-bg"]',
                  );
                  if (matches.length !== 1)
                    throw new Error(`Expected one city card per row, found ${matches.length}`);
                  return matches[0]!;
                });
                // Capture the complete painted page, not a staging row or a hidden card.
                // A card that never paints still fails the exact eight-page assertion below.
                if (!cards.every((card) => isPainted(card, 0.999))) continue;
                cardGeometry.push(
                  cards.map((card) => {
                    const rect = card.getBoundingClientRect();
                    return {
                      x: (rect.x - stage.x) / stage.width,
                      y: (rect.y - stage.y) / stage.height,
                      width: rect.width / stage.width,
                      height: rect.height / stage.height,
                    };
                  }),
                );
              }
              pages.push(names);
            }
          }
          const photoAlpha = Number(getComputedStyle(photo).opacity);
          const panelAlpha = Number(getComputedStyle(panel).opacity);
          photoFullOpacity = Math.max(photoFullOpacity, photoAlpha);
          panelFullOpacity = Math.max(panelFullOpacity, panelAlpha);
          if (pages.length === pageCount) {
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
          cardGeometry,
          sawPageCounter,
          photoFaded,
          panelFaded,
          finalPageGone,
          finalPageReappeared,
          backgroundFadedBeforeFinalPageExit,
          settled: false,
          finalPageVisibleMs: (finalPageLastSeenAt ?? 0) - (finalPageAt ?? 0),
        };
      },
      {
        pageCount: variant.expectedPages.length,
        finalCity: variant.expectedPages.at(-1)![0]!,
        observationMs: variant.observationMs,
        inspectCards: variant.inspectCards,
      },
    );
    expect(result.pages).toEqual(variant.expectedPages);
    expect(result.leads).toEqual(variant.expectedPages.map((page) => page[0]));
    expect(result.pages.flat()).toHaveLength(31);
    expect(new Set(result.pages.flat()).size).toBe(31);
    if (variant.inspectCards) {
      expect(result.cardGeometry.map((cards) => cards.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 3]);
      for (const cards of result.cardGeometry) {
        for (const [index, card] of cards.entries()) {
          expect(card.width).toBeCloseTo(384 / 1920, 3);
          expect(card.height).toBeCloseTo(600 / 1080, 3);
          expect(card.x).toBeGreaterThanOrEqual(0);
          expect(card.y).toBeGreaterThanOrEqual(0);
          expect(card.x + card.width).toBeLessThanOrEqual(1);
          expect(card.y + card.height).toBeLessThanOrEqual(1);
          if (index > 0) {
            const previous = cards[index - 1]!;
            expect(card.x + card.width).toBeLessThan(previous.x);
            expect(card.y).toBeCloseTo(previous.y, 3);
          }
        }
      }
    }
    expect(result.sawPageCounter).toBe(false);
    expect(result.finalPageVisibleMs).toBeGreaterThanOrEqual(6_000);
    expect(result.photoFaded).toBe(true);
    expect(result.panelFaded).toBe(true);
    expect(result.finalPageGone).toBe(true);
    expect(result.finalPageReappeared).toBe(false);
    expect(result.backgroundFadedBeforeFinalPageExit).toBe(false);
    expect(result.settled).toBe(true);
  });
}
