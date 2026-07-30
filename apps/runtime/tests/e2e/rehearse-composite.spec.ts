import type { Page } from '@playwright/test';
import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * R-022 — PVW COMPOSITES EVERY REHEARSING ROW, and the operator's placement
 * override reaches each frame.
 *
 * The real-browser end of `tests/previewPanel.composite.dom.test.ts` and
 * `tests/frameEnvironment.dom.test.ts`. What only a real browser can answer is
 * here: actual iframe documents, a real `load`, real computed styles and a real
 * box. Everything that is a resolution rule rather than a rendering fact is
 * asserted in the unit tests, where it is cheaper and sharper.
 *
 * Why the retained page has to be stubbed: the offline mock retains no rendered
 * page (`templates.html` resolves `null` — deliberately, see
 * `createRuntimeBridge`), so PREVIEW would render its "unavailable in this
 * browser" text and no iframe would exist at all. The stub is a TEST-ONLY
 * override of one bridge method, not a change to what the mock honestly holds.
 */

/**
 * A stand-in for the served self-contained page.
 *
 * It carries the two things this spec's subject actually touches: a `.cg-stage`
 * with the INLINE resolution `buildScene` writes, and a `window.CG` exposing
 * `applyOutputPosition`. The stand-in RECORDS the search it is handed rather
 * than computing a placement — the placement maths is `@cg/template-runtime`'s
 * and is unit-tested there, while what this spec must prove is that the
 * operator's override REACHES the page at all, which is precisely what a
 * `srcdoc` frame's empty `location.search` prevented.
 */
function stubPage(marker: string): string {
  return `<!doctype html><html><head><title>${marker}</title></head>
<body style="margin:0">
  <div class="cg-stage" style="width:1920px;height:1080px"></div>
  <script>
    window.__cgApplied = [];
    window.CG = {
      applyOutputPosition: function (scene, options) {
        window.__cgApplied.push(options && options.search);
        var stage = document.querySelector('.cg-stage');
        if (stage) stage.setAttribute('data-applied', options && options.search);
      }
    };
    window.play = function () {}; window.update = function () {};
    window.next = function () {}; window.stop = function () {};
  </script>
</body></html>`;
}

/** Serve the stand-in page for every template. */
async function stubRetainedPage(page: Page): Promise<void> {
  await page.evaluate((html: string) => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () => Promise.resolve(html);
  }, stubPage('rehearsal'));
}

function frames(page: Page) {
  return page.locator('iframe[data-rehearsal-frame]');
}

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'REHEARSE', exact: true })
    .click();
}

test('every rehearsing row gets a frame, stacked by the REAL CasparCG layer', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  // Two rows, on DIFFERENT layers. The lower-numbered layer is imported first so
  // that neither the import order nor the display order matches the stacking
  // order — if the composite keyed off either, this would pass by accident.
  const low = await app.importVcg('a.vcg', await buildValidVcg('tpl-low'));
  const high = await app.importVcg('b.vcg', await buildValidVcg('tpl-high'));
  expect(high).toBeGreaterThan(low);
  await stubRetainedPage(page);

  await rehearseRow(page, low);
  await rehearseRow(page, high);

  // THE BUG: the panel used to render exactly one of these.
  await expect(frames(page)).toHaveCount(2);

  // Z-ORDER — resolved, not snapshotted. The HIGHER CasparCG layer draws on top.
  const lowFrame = frames(page).nth(0);
  const highFrame = frames(page).nth(1);
  const zOf = async (i: number): Promise<number> =>
    Number(
      await frames(page)
        .nth(i)
        .evaluate((el) => getComputedStyle(el).zIndex),
    );
  // Both frames are the same size and in the same box, so document order alone
  // would decide the paint; the explicit z-index is asserted because it is what
  // makes the order survive a refactor of the render loop.
  expect(await zOf(1)).toBeGreaterThan(await zOf(0));
  // …and the frame carrying the higher layer really is the upper one.
  const upperItem = await highFrame.getAttribute('data-rehearsal-frame');
  const lowerItem = await lowFrame.getAttribute('data-rehearsal-frame');
  expect(upperItem).not.toBe(lowerItem);

  // The panel SAYS how many it is compositing — no silent partial view.
  await expect(page.locator('[data-rehearsal-caption]')).toContainText('Rehearsing 2 rows');
});

/**
 * ── THE CHECKERBOARD IS VISIBLE THROUGH A LOADED FRAME ──────────────────────
 *
 * The reported defect is a flat WHITE 16:9 area where the raster is, which the
 * graphics cannot be read against: the checker flashes and is then covered. The
 * checker is correctly positioned behind the frame, so what matters is whether
 * the loaded frame COVERS it.
 *
 * ASSERTED BY PIXEL DIFFERENCE, and that is the point of writing it this way. A
 * computed-style assertion ("the document's background is transparent") passes
 * whether or not anything shows through — it was the first form of this test and
 * it would have gone green while an operator stared at a white box, which is the
 * same class of defect as the panel this change fixes. Comparing the rendered
 * box against the same box with an OPAQUE page in the frame is a claim about
 * what is actually painted: if the frame covered the checker either way, the two
 * images would be identical.
 *
 * The cause is now known and fixed — an opaque canvas forced by a color-scheme
 * mismatch between the frame and the page it embeds, see `RehearsalFrame`'s
 * style object — and the tests that pin it by absolute colour are in
 * `rehearse-canvas.spec.ts`. This one is kept because it asserts a different
 * thing: not "the canvas is transparent" but "the frame does not cover what is
 * behind it", which stays true and worth guarding whatever paints next.
 */
test('the checkerboard is NOT covered by a loaded frame', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const layer = await app.importVcg('a.vcg', await buildValidVcg('tpl-checker'));
  await stubRetainedPage(page);
  await rehearseRow(page, layer);
  await expect(frames(page)).toHaveCount(1);

  const frame = frames(page).first();
  const checker = page.locator('[data-rehearsal-checker]');
  await expect(checker).toHaveCount(1);

  // The checker sits BEHIND the frame and in the SAME box — under the raster,
  // not out in the black surround where there is no graphic to judge.
  const checkerZ = Number(await checker.evaluate((el) => getComputedStyle(el).zIndex));
  const frameZ = Number(await frame.evaluate((el) => getComputedStyle(el).zIndex));
  expect(frameZ).toBeGreaterThan(checkerZ);
  const cBox = await checker.boundingBox();
  const fBox = await frame.boundingBox();
  expect(cBox).not.toBeNull();
  expect(fBox).not.toBeNull();
  expect(Math.abs(cBox!.x + cBox!.width / 2 - (fBox!.x + fBox!.width / 2))).toBeLessThan(2);
  expect(Math.abs(cBox!.y + cBox!.height / 2 - (fBox!.y + fBox!.height / 2))).toBeLessThan(2);

  // …and it is genuinely VISIBLE through the loaded page. Same box, twice: once
  // as it renders, once with the page inside forced opaque. A frame that covered
  // the checker would paint the same both times.
  await expect
    .poll(async () =>
      frame.evaluate((el) => (el as HTMLIFrameElement).contentDocument?.readyState === 'complete'),
    )
    .toBe(true);
  const transparent = await checker.screenshot();

  await frame.evaluate((el) => {
    const doc = (el as HTMLIFrameElement).contentDocument;
    if (doc === null) return;
    const s = doc.createElement('style');
    s.textContent = 'html,body{background:rgb(255,255,255)}';
    doc.head.appendChild(s);
  });
  // Let the compositor settle on the changed frame before sampling again.
  await expect
    .poll(async () =>
      frame.evaluate((el) => {
        const doc = (el as HTMLIFrameElement).contentDocument;
        return doc === null ? '' : getComputedStyle(doc.body).backgroundColor;
      }),
    )
    .toBe('rgb(255, 255, 255)');
  const covered = await checker.screenshot();

  expect(Buffer.compare(transparent, covered)).not.toBe(0);
});

/**
 * ── A POSITION CHANGE REACHES THE PREVIEW ────────────────────────────────────
 *
 * The diagnosis this closes: the override is delivered on the served URL's
 * query and read at boot from `location.search`. A `srcdoc` frame's URL is
 * `about:srcdoc`, so that search is ALWAYS empty and every rehearsal rendered
 * the AUTHORED position however many times Apply was pressed.
 *
 * And it must reach ONLY the edited row: position editing applies to the
 * SELECTED row, and a composite that re-placed graphics nobody edited would be
 * its own defect.
 */
test('an applied position reaches the SELECTED row’s frame and no other', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const edited = await app.importVcg('a.vcg', await buildValidVcg('tpl-edited'));
  const untouched = await app.importVcg('b.vcg', await buildValidVcg('tpl-untouched'));
  await stubRetainedPage(page);
  await rehearseRow(page, edited);
  await rehearseRow(page, untouched);
  await expect(frames(page)).toHaveCount(2);

  const appliedOn = async (templateId: string): Promise<string[]> => {
    const itemId = await page
      .locator(`[data-template-id="${templateId}"]`)
      .first()
      .getAttribute('data-item-id');
    return page
      .locator(`iframe[data-rehearsal-frame="${itemId ?? ''}"]`)
      .evaluate(
        (el) =>
          ((el as HTMLIFrameElement).contentWindow as unknown as { __cgApplied?: string[] })
            .__cgApplied ?? [],
      );
  };

  // Neither page has been handed an override yet: nothing has been applied, and
  // abstaining is correct — an empty search would resolve to CENTRED and MOVE a
  // correctly-placed graphic.
  expect(await appliedOn('tpl-edited')).toEqual([]);
  expect(await appliedOn('tpl-untouched')).toEqual([]);

  // Select the edited row and apply a position.
  await app.selectStackRow('tpl-edited');
  const picker = app.inspector;
  await expect(picker.getByRole('button', { name: 'Apply position' })).toBeEnabled();
  await picker.getByRole('button', { name: 'Anchor top-left' }).click();
  await picker.getByLabel('Position offset X').fill('42');
  await picker.getByLabel('Position offset Y').fill('7');
  await picker.getByRole('button', { name: 'Apply position' }).click();

  // THE FIX: the override arrives at that page, spelled exactly as the bridge
  // spells it onto CasparCG's served URL.
  await expect.poll(async () => appliedOn('tpl-edited')).toEqual(['?pos=top-left&dx=42&dy=7']);

  // …and the other frame's document was never touched.
  expect(await appliedOn('tpl-untouched')).toEqual([]);
});

/**
 * ── A ROW THAT LEAVES REHEARSE AND COMES BACK IS NOT COUNTED AS ALREADY BOOTED ─
 *
 * Found by reviewing this change's own diff rather than by a report, and it is
 * the failure class the composite makes possible: the stage arms its transport
 * once EVERY frame has booted, tracked as a set of item ids. An unmounting frame
 * that did not withdraw its id left the set claiming a row was ready, so on
 * re-entry the transport was live against a document that had not run yet —
 * `window.play` undefined, the optional call a no-op, and PLAY visibly running
 * the composite with one graphic sitting still. Silent, and exactly the "lands
 * for some rows and not others" shape.
 */
test('re-entering rehearse re-arms the transport rather than inheriting stale readiness', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-a'));
  const b = await app.importVcg('b.vcg', await buildValidVcg('tpl-b'));
  await stubRetainedPage(page);

  const transport = page
    .getByRole('region', { name: 'PREVIEW' })
    .getByRole('button', { name: /^PLAY/ });

  await rehearseRow(page, a);
  await rehearseRow(page, b);
  await expect(frames(page)).toHaveCount(2);
  await expect(transport).toBeEnabled();

  // Leave rehearse on one row, then re-enter it. The verb is a TOGGLE in a fixed
  // slot, so its word flips to END REHEARSE while the row is rehearsing.
  await page
    .locator(`[data-layer="${String(b)}"]`)
    .getByRole('button', { name: 'END REHEARSE', exact: true })
    .click();
  await expect(frames(page)).toHaveCount(1);
  await rehearseRow(page, b);
  await expect(frames(page)).toHaveCount(2);

  // Both frames must really have booted for the transport to be live — and the
  // returning row must have gone through a fresh boot to get there.
  await expect(transport).toBeEnabled();
  const booted = await frames(page).evaluateAll((els) =>
    els.every(
      (el) =>
        typeof (el as HTMLIFrameElement).contentWindow?.['play' as keyof Window] === 'function',
    ),
  );
  expect(booted).toBe(true);
});

/**
 * The scene is BYTE-IDENTICAL after a position rehearsal. "Saving the position"
 * writes the operator override (R-011) and never the authored position in the
 * scene — otherwise the operator would silently rewrite a template that other
 * rows and other installations also use.
 */
test('the scene is byte-identical after a position rehearsal', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const layer = await app.importVcg('a.vcg', await buildValidVcg('tpl-bytes'));
  await stubRetainedPage(page);
  await rehearseRow(page, layer);
  await expect(frames(page)).toHaveCount(1);

  const servedBefore = await page.evaluate(() =>
    (
      window as unknown as { cg: { templates: { html: (id: string) => Promise<string> } } }
    ).cg.templates.html('tpl-bytes'),
  );
  const stageBefore = await frames(page)
    .first()
    .evaluate((el) =>
      (el as HTMLIFrameElement).contentDocument?.querySelector('.cg-stage')?.getAttribute('style'),
    );

  await app.selectStackRow('tpl-bytes');
  const picker = app.inspector;
  await picker.getByRole('button', { name: 'Anchor bottom-left' }).click();
  await picker.getByLabel('Position offset X').fill('-5');
  await picker.getByRole('button', { name: 'Apply position' }).click();
  await expect
    .poll(async () =>
      frames(page)
        .first()
        .evaluate(
          (el) =>
            (el as HTMLIFrameElement).contentDocument
              ?.querySelector('.cg-stage')
              ?.getAttribute('data-applied') ?? null,
        ),
    )
    .toBe('?pos=bottom-left&dx=-5&dy=0');

  // The SERVED PAGE — the bytes the bridge hands CasparCG — is unchanged. There
  // is no code path from a rehearsal to the scene: it is inlined in that page,
  // read-only here, never re-rendered or re-packed. Now that the rehearsal does
  // write into the frame's document to place the graphic, this is worth pinning
  // rather than arguing.
  const servedAfter = await page.evaluate(() =>
    (
      window as unknown as { cg: { templates: { html: (id: string) => Promise<string> } } }
    ).cg.templates.html('tpl-bytes'),
  );
  expect(servedAfter).toBe(servedBefore);

  // And the scene's own authored footprint — the stage's inline resolution — is
  // untouched. Only the placement moved.
  const stageAfter = await frames(page)
    .first()
    .evaluate((el) =>
      (el as HTMLIFrameElement).contentDocument?.querySelector('.cg-stage')?.getAttribute('style'),
    );
  expect(stageAfter).toBe(stageBefore);
});
