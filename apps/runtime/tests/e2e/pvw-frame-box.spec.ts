import type { Page } from '@playwright/test';
import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * PVW's IFRAME BOX IS THE OPERATOR'S PLACEMENT, and panel chrome may not move it.
 *
 * ── WHY THIS IS NOT A COSMETIC ASSERTION ────────────────────────────────────
 *
 * Each rehearsal renders the retained page in a same-origin iframe SIZED TO THE
 * CHANNEL RASTER, and the page's own R-030 placement chain falls through to
 * `window.innerWidth` / `innerHeight` — which, inside a frame, IS the box PVW
 * sized. That is why there is no second placement implementation to drift from
 * air, and it is also why the box is not decoration: it is the frame the
 * operator's placement is computed against.
 *
 * So a change to this panel's padding, scroll container, border box or content
 * sizing can silently change what the operator sees a graphic's position to be.
 * Not a visual regression — a PLACEMENT regression, in the one surface built to
 * be trusted about placement, and it would look completely fine on screen. A
 * screenshot cannot catch it; only a measurement can.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS AN EQUALITY ─────────────────────────────
 *
 * `clientWidth` / `clientHeight` of every frame EQUAL the channel raster,
 * exactly. Not "close to", not "unchanged since some recorded baseline": the
 * frame's box has one correct value and it is the raster, so the assertion can
 * be the strongest available one. A tolerance here would pass through precisely
 * the small drift that would misplace a graphic.
 *
 * The FIT scale is deliberately not measured, because it is not supposed to be
 * stable — it is a CSS `transform: scale()` on the element that changes with the
 * panel's size and CANNOT change what the document inside measures. Chrome
 * changes (a taller shared panel bar, for one) are expected to move `fit` and
 * required not to move the box. That separation is the whole design; this test
 * is what holds it.
 *
 * EVERY FRAME, not the first: PVW composites one per rehearsing row.
 */

/** The reference raster the fixtures' channel settings resolve to. */
const RASTER = { width: 1920, height: 1080 } as const;

/** A page that paints nothing — the box is the subject here, not the pixels. */
function blankPage(): string {
  return `<!doctype html><html><head>
<style>html,body{width:1920px;height:1080px;background:transparent;overflow:hidden;margin:0}</style>
</head><body>
  <script>window.play=function(){};window.update=function(){};window.next=function(){};window.stop=function(){};</script>
</body></html>`;
}

async function stubPagesByTemplate(page: Page, pages: Record<string, string>): Promise<void> {
  await page.evaluate((byId: Record<string, string>) => {
    (
      window as unknown as { cg: { templates: { html: (id: string) => Promise<string | null> } } }
    ).cg.templates.html = (id: string) => Promise.resolve(byId[id] ?? null);
  }, pages);
}

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

/** Every rehearsal frame's INNER box, as the embedded page measures it. */
async function frameBoxes(page: Page): Promise<{ w: number; h: number }[]> {
  return page.locator('iframe[data-rehearsal-frame]').evaluateAll((els) =>
    els.map((el) => ({
      w: (el as HTMLIFrameElement).clientWidth,
      h: (el as HTMLIFrameElement).clientHeight,
    })),
  );
}

test('every rehearsal frame measures the channel raster — at any panel size, in any chrome', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const lowLayer = await app.importVcg('low.vcg', await buildValidVcg('tpl-box-lower'));
  const highLayer = await app.importVcg('high.vcg', await buildValidVcg('tpl-box-upper'));
  await stubPagesByTemplate(page, {
    'tpl-box-lower': blankPage(),
    'tpl-box-upper': blankPage(),
  });

  await rehearseRow(page, lowLayer);
  await rehearseRow(page, highLayer);
  await expect(page.locator('iframe[data-rehearsal-frame]')).toHaveCount(2);

  const docked = await frameBoxes(page);
  expect(docked).toHaveLength(2);
  for (const box of docked) {
    expect(box.w, 'frame width in the docked panel').toBe(RASTER.width);
    expect(box.h, 'frame height in the docked panel').toBe(RASTER.height);
  }

  /*
   * THE SAME FRAMES IN A COMPLETELY DIFFERENT CHROME. Fullscreen changes the
   * panel's width, its height and the space its bar takes from the content — the
   * biggest chrome change this panel can undergo, and a superset of what any
   * padding or bar-height edit does to it. The FIT scale must move; the box must
   * not, because the box is what the page inside measures itself against.
   */
  await page.getByRole('button', { name: 'Show PREVIEW (PVW) fullscreen' }).click();
  await expect(page.locator('iframe[data-rehearsal-frame]')).toHaveCount(2);

  const full = await frameBoxes(page);
  expect(full).toHaveLength(2);
  for (const box of full) {
    expect(box.w, 'frame width at fullscreen').toBe(RASTER.width);
    expect(box.h, 'frame height at fullscreen').toBe(RASTER.height);
  }

  // Stated as the invariant the panel actually owes, not merely as two equal
  // numbers: the box survived a chrome change that moved everything around it.
  expect(full).toEqual(docked);
});
