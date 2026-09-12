import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * R-049 — A LIVE PLATE IS VISIBLE IN PVW, AND SAYS WHICH SOURCE IS BEHIND IT.
 *
 * The reported defect, from the owner's live testing: in CG Control's PVW you
 * cannot tell a live plate exists at all. The rendered page paints ZERO PIXELS
 * where a Live Source is — correctly, and unchanged by this spec's subject
 * (`live-source-multibox` design.md §12.2) — so an empty region was
 * indistinguishable from a broken render, and nothing said which source was
 * bound to which plate.
 *
 * ── WHAT ONLY A REAL BROWSER CAN ANSWER, AND WHY THIS SPEC EXISTS ───────────
 *
 * The placement arithmetic is pinned in `tests/livePlateGeometry.test.ts`, over a
 * table of NON-16:9 rasters where the terms do not collapse; the two states are
 * pinned in `tests/livePlateOverlay.dom.test.ts`. Neither can answer the question
 * this spec is for: does the marker actually land ON the hole, measured against a
 * REAL laid-out page, through a REAL fit transform, with a real ResizeObserver
 * driving it? jsdom reports every box as zero, so the alignment claim is
 * unfalsifiable there — it is exactly the shape of assertion that goes green
 * while an operator looks at a marker floating in the wrong place.
 *
 * ── THE PAGE IS A STAND-IN, AND IT CARRIES THE HOLE AT THE DECLARED RECT ────
 *
 * The offline mock retains no rendered page, so PVW would show its "unavailable
 * in this browser" state and there would be no frame at all. The stand-in is a
 * TEST-ONLY override of one bridge method (the `rehearse-composite.spec.ts`
 * precedent), and it paints the holes' rects as MEASURABLE, invisible boxes at
 * exactly the coordinates the registered `TemplateInfo` declares. That is what
 * makes "the marker sits on the hole" a real comparison rather than a restatement
 * of the same numbers: the page positions its boxes by its own CSS, the overlay
 * positions its markers by the geometry chain, and the test compares the two
 * results in viewport pixels.
 */

const TWO_BOX = 'tpl-e2e-pvw-plates';

/** Where each hole sits, in the scene's own pixels. The page and the registry agree. */
const HOLES = {
  'guest-1': { x: 120, y: 140, width: 640, height: 360 },
  'guest-2': { x: 1000, y: 560, width: 480, height: 270 },
} as const;

/**
 * A stand-in for the served self-contained page: a full-frame `.cg-stage` with a
 * transparent, zero-painting box at each declared hole.
 *
 * The boxes paint NOTHING (this is what the real export does), but they are laid
 * out, so `getBoundingClientRect()` reports where the page believes the hole is.
 */
function pageWithHoles(): string {
  const boxes = Object.entries(HOLES)
    .map(
      ([id, r]) =>
        `<div data-hole="${id}" style="position:absolute;left:${String(r.x)}px;top:${String(r.y)}px;` +
        `width:${String(r.width)}px;height:${String(r.height)}px"></div>`,
    )
    .join('');
  // D-087's BLANK-UNTIL-PLAY contract, modelled the way the real runtime models
  // it: `body.cg-pending` hides the stage, `play()` clears it, `stop()` re-adds
  // it. The stand-in carries it because one of this spec's subjects is precisely
  // how the overlay behaves ACROSS that transition — a page that painted from
  // boot could not tell the two apart.
  return `<!doctype html><html><head>
<style>html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent}
.cg-stage{position:absolute;left:0;top:0;width:1920px;height:1080px}
body.cg-pending .cg-stage{visibility:hidden}
[data-painted]{position:absolute;left:40px;top:40px;width:200px;height:80px;background:#3355ff}</style>
</head><body class="cg-pending">
  <div class="cg-stage">${boxes}<div data-painted></div></div>
  <script>
    window.play=function(){document.body.classList.remove('cg-pending');};
    window.stop=function(){document.body.classList.add('cg-pending');};
    window.update=function(){};window.next=function(){};
  </script>
</body></html>`;
}

async function stubRetainedPage(page: Page): Promise<void> {
  await page.evaluate((html: string) => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () => Promise.resolve(html);
  }, pageWithHoles());
}

/** Register a template declaring the two holes above, as an import would leave it. */
async function registerTwoBox(page: Page): Promise<void> {
  await page.evaluate(
    async ({ templateId, holes }) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> };
        };
      };
      await w.cg.templates.import({
        template: {
          templateId,
          name: 'two-box',
          sourceFileName: 'two-box.vcg',
          templateType: 'lower-third',
          fields: [],
          liveSources: {
            resolution: { width: 1920, height: 1080 },
            // `PositionSchema`'s real shape — `offset: {x,y}`, NOT the `dx`/`dy`
            // of the query serialisation. The placeholder geometry resolves this
            // through the same `outputTranslate` the page runs, so a query-shaped
            // literal here would reach `position.offset.x` as `undefined`.
            defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
            sources: Object.entries(holes).map(([sourceId, rect], i) => ({
              elementId: `el-${String(i + 1)}`,
              sourceId,
              rect,
              dynamic: false,
            })),
          },
        },
        html: '<!doctype html><html><body>two-box</body></html>',
      });
    },
    { templateId: TWO_BOX, holes: HOLES },
  );
}

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

const marker = (page: Page, plateId: string) => page.locator(`[data-live-plate="${plateId}"]`);

/** The REHEARSAL's transport, not a stack row's — see the call site. */
const pvwTransport = (page: Page, verb: 'PLAY' | 'STOP') =>
  page
    .getByRole('region', { name: 'PREVIEW (PVW)' })
    .getByRole('button', { name: verb, exact: true });

/*
 * 🔴 `MONITORS-01` — THE STRIP IS FOLDED AWAY WHEN THE CONSOLE BOOTS, and this file's
 * subject lives inside it, so it is opened first.
 *
 * The default moved from SHOWN to HIDDEN because neither box is confidence monitoring:
 * PGM is a fixed empty placeholder for the unbuilt `C-016`, and PVW is a LOCAL browser
 * render of the rehearsing rows (`R-022` — nothing is ever sent to CasparCG). None of
 * that changes what this file proves, so the state each test was written against is
 * established rather than its assertions being rewritten.
 *
 * `app.showMonitors()` asserts the strip is actually up before returning — see the
 * fixture. Boot state itself is proved in `shell-chrome.spec.ts` §B4.
 */
test.beforeEach(async ({ app }) => {
  await app.showMonitors();
});
test('PVW marks every live plate, and the marker lands ON the hole', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);

  // THE DEFECT: nothing at all used to be visible here.
  await expect(page.locator('[data-live-plate]')).toHaveCount(2);

  // ── ALIGNMENT, measured in VIEWPORT pixels on both sides ─────────────────
  //
  // The page's own laid-out box for each hole, versus the overlay's marker for
  // the same plate. Two independent routes to one answer: the page applies its
  // CSS inside a raster-sized iframe that is then fit-scaled; the overlay applies
  // the scene-px → raster-px chain inside a box carrying the SAME fit transform.
  // If a second scale factor were ever derived beside the stage's own, this is
  // what would catch it.
  for (const plateId of Object.keys(HOLES)) {
    const hole = await page
      .frameLocator('iframe[data-rehearsal-frame]')
      .locator(`[data-hole="${plateId}"]`)
      .boundingBox();
    const box = await marker(page, plateId).boundingBox();
    expect(hole).not.toBeNull();
    expect(box).not.toBeNull();
    if (hole === null || box === null) throw new Error('unreachable');
    // Sub-pixel tolerance only: these are the same transform applied twice, so
    // anything beyond rounding is a real divergence. A loose tolerance here would
    // pass through exactly the drift the test exists to find.
    expect(Math.abs(box.x - hole.x)).toBeLessThan(1.5);
    expect(Math.abs(box.y - hole.y)).toBeLessThan(1.5);
    expect(Math.abs(box.width - hole.width)).toBeLessThan(1.5);
    expect(Math.abs(box.height - hole.height)).toBeLessThan(1.5);
  }

  // ── AND IT SURVIVES A RESIZE, which is when a second scale would show ────
  await page.setViewportSize({ width: 1100, height: 780 });
  await expect
    .poll(async () => {
      const hole = await page
        .frameLocator('iframe[data-rehearsal-frame]')
        .locator('[data-hole="guest-1"]')
        .boundingBox();
      const box = await marker(page, 'guest-1').boundingBox();
      if (hole === null || box === null) return 99;
      return Math.max(Math.abs(box.x - hole.x), Math.abs(box.y - hole.y));
    })
    .toBeLessThan(1.5);
});

test('the two plate states are told apart WITHOUT reading the label', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);

  // With nothing bound, BOTH plates are the unassigned state — and they say so.
  await expect(page.locator('[data-live-plate-state="unassigned"]')).toHaveCount(2);
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');
  /*
    Every marker declares itself, in both states: an operator must never be able to believe
    PVW is showing the real picture.

    🔴 SUPERSEDED IN FORM BY `CONSOLE-LOOK-06` DELTA D6, not in substance. This used to read
    `toContainText('PLACEHOLDER')` on the marker itself. These two plates render 97 px and
    73 px wide against a label that is a fixed 156.8 px, so the words were being CLIPPED to a
    fragment — and the owner's ruling names the fallback: they move to the stamp's own line,
    permanent and still on canvas. So the claim is asserted where it now holds, and the
    marker keeps the half that always fits: its accessible name.
  */
  await expect(page.locator('[data-stage-illustration]')).toHaveText(
    'ILLUSTRATIVE COMPOSITE · LOCAL · LIVE SOURCES NOT RENDERED',
  );
  await expect(marker(page, 'guest-1')).toHaveAttribute('aria-label', /placeholder, not video/i);

  // Define a source, then BIND it to one plate through the Inspector.
  await app.openStationSetupAt('Live sources');
  // `STATION-CHROME-01` §6 — through the Add dialog every Add opens; the fixture owns the
  // flow so a change to it does not cost this spec an edit.
  await app.addLiveSource('Studio A');
  await app.closeStationSetup();

  await app.selectLayerRow(layer);
  const plates = app.inspector.locator('[aria-label="Live plates"]');
  await plates.getByLabel('Source for guest-1').selectOption({ label: 'Studio A' });

  // 🔴 STAGED IS NOT ASSIGNED. The Inspector's control shows the draft; PVW must
  // not, because a take at this moment would still be REFUSED. Showing it as
  // bound would tell the operator the take will work at the exact moment it will
  // not — which is the failure PVW is their last chance to catch.
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');

  await app.applyEdits();

  // Applied: the plate flips state and names the INSTALLATION's source — the join
  // no exported page can make, because it carries a plate identifier and nothing
  // else.
  await expect(marker(page, 'guest-1')).toHaveAttribute('data-live-plate-state', 'assigned');
  await expect(marker(page, 'guest-1')).toContainText('Studio A');
  await expect(marker(page, 'guest-2')).toHaveAttribute('data-live-plate-state', 'unassigned');

  // ── THE ACROSS-THE-ROOM DIFFERENCE, asserted on COMPUTED STYLE ───────────
  // The requirement is that the states are separable before a word is read, so
  // the assertion is about what is painted, not about what is written. A test
  // that only compared the text would pass against two identical-looking boxes.
  const filters = await Promise.all(
    ['guest-1', 'guest-2'].map((id) =>
      marker(page, id).evaluate((el) => getComputedStyle(el).filter),
    ),
  );
  expect(filters[0]).not.toBe(filters[1]);
  expect(filters[1]).toContain('grayscale');
});

/**
 * R-049 — THE MARKER IS VISIBLE BEFORE PLAY, AND IT DOES NOT REOPEN D-087.
 *
 * Observed by the owner: the placeholders paint as soon as PVW opens, while the
 * template's own elements stay blank until Play. That is D-087's blank-until-play
 * contract, which the rehearse frame inherits by rendering the exported page
 * verbatim — `body.cg-pending` hides the stage until `play()` clears it.
 *
 * 🔴 THE OVERLAY IS DELIBERATELY OUTSIDE THAT CONTRACT, and this test is what
 * makes it a decision instead of a side effect.
 *
 *   - IT MUST BE VISIBLE BEFORE PLAY. The item's own acceptance is the argument:
 *     an unassigned plate REFUSES the take, and PVW is the operator's LAST CHANCE
 *     to see that before air. A marker that appeared only after Play would be
 *     absent at exactly the moment it was filed to serve.
 *   - IT DOES NOT REOPEN D-087, for the same reason it does not reopen §12.2: the
 *     PAGE still paints nothing before Play. `cg-pending` is a class on the page's
 *     own `body`, and the overlay is not page content — it is a Runtime layer
 *     composited over the frame. The blank-until-play contract is untouched, and
 *     this spec asserts that directly by checking the page's own stage is hidden
 *     in the same breath as the marker being visible.
 *   - IT PERSISTS UNCHANGED DURING PLAY, which is where requirement 4 (never
 *     mistakable for a real incoming picture) is most load-bearing: the hole is
 *     still a hole while the graphic plays, so removing the marker would restore
 *     the original defect at the one moment the frame looks most like air.
 */
test('the marker is visible BEFORE Play and unchanged through Play and Stop', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);

  const stage = page.frameLocator('iframe[data-rehearsal-frame]').locator('.cg-stage');
  const painted = page.frameLocator('iframe[data-rehearsal-frame]').locator('[data-painted]');

  // ── BEFORE PLAY ──────────────────────────────────────────────────────────
  // The PAGE is blank — D-087, inherited verbatim and untouched…
  await expect(painted).toBeHidden();
  // …and the MARKER is already there, which is the decision.
  await expect(marker(page, 'guest-1')).toBeVisible();
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');
  const before = await marker(page, 'guest-1').boundingBox();

  // ── DURING PLAY ──────────────────────────────────────────────────────────
  // Scoped to the PVW REGION: every stack row carries a PLAY of its own, and
  // those drive AIR. The transport under test is the rehearsal's, which runs the
  // lifecycle locally and sends nothing to CasparCG.
  await pvwTransport(page, 'PLAY').click();
  await expect(painted).toBeVisible();
  // The graphic is now painting and the marker is UNCHANGED — same box, same
  // state, same words. It carries no lifecycle input at all, and that is the
  // recorded behaviour rather than an accident of when it happens to render.
  await expect(marker(page, 'guest-1')).toBeVisible();
  await expect(marker(page, 'guest-1')).toContainText('no source assigned');
  await expect(marker(page, 'guest-1')).toHaveAttribute('data-live-plate-state', 'unassigned');
  const during = await marker(page, 'guest-1').boundingBox();
  expect(before).not.toBeNull();
  expect(during).not.toBeNull();
  if (before === null || during === null) throw new Error('unreachable');
  expect(Math.abs(during.x - before.x)).toBeLessThan(1.5);
  expect(Math.abs(during.y - before.y)).toBeLessThan(1.5);
  expect(Math.abs(during.width - before.width)).toBeLessThan(1.5);

  // ── AFTER STOP ───────────────────────────────────────────────────────────
  // The page settles blank again; the marker still says a live region is there.
  await pvwTransport(page, 'STOP').click();
  await expect(painted).toBeHidden();
  await expect(marker(page, 'guest-1')).toBeVisible();
  // The stage element itself is never removed by any of this — the frame is the
  // page's, and nothing here reaches into it.
  await expect(stage).toHaveCount(1);
});

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA D6 — `R-022`'s TWO CAVEATS ARE TWO PERMANENT MARKS ON CANVAS.
 *
 * The owner's ruling after `CONSOLE-LOOK-06`'s report, which had recorded `R-022` as PARTLY
 * MET with both caveats riding a `title`: "a hover is not where they live. Put each caveat at
 * the thing it describes, permanently."
 *
 *   1. *faithful, not pixel-identical* — MET BY THE STAMP. `ILLUSTRATIVE COMPOSITE · LOCAL`
 *      says it in three words: ILLUSTRATIVE is not-pixel-identical, LOCAL is
 *      rendered-here-and-not-the-server's-output. No paragraph is needed and none is missing.
 *   2. *a Live Source region is a placeholder, not video* — MET BY THE REGION'S OWN CHIP,
 *      which has been on canvas since `add-multibox-audio`: `LIVE SOURCE · PLACEHOLDER`,
 *      uppercase, tracked, muted, unmistakably chrome. The stamp cannot say this one, because
 *      the stamp describes the whole picture and this is about one region inside it.
 *
 * What D6 ADDED is the accessible half: the long sentence on the region, so the visible label
 * is the short form and the accessible name is the long one — both, not either.
 *
 * ⭐ The reason a hover was refused is `R-028`'s: a hover serves the moment the console IS
 * helping, and deciding whether to trust the PVW picture is exactly the moment it is not.
 */
test('D6 — each live-source region states the caveat permanently, on canvas AND in its accessible name', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  await registerTwoBox(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TWO_BOX);
  await rehearseRow(page, layer);

  const regions = page.locator('[data-live-plate]');
  await expect(regions.first()).toBeVisible();
  const count = await regions.count();
  expect(count).toBeGreaterThan(0);

  /*
    🔴 THE ACCESSIBLE HALF IS UNCONDITIONAL — every region, at every size, carries the full
    sentence. This is the half D6 added, and it is the half that must never degrade.
  */
  for (let i = 0; i < count; i += 1) {
    const label = (await regions.nth(i).getAttribute('aria-label')) ?? '';
    expect(label, 'the region says it is a placeholder').toMatch(/placeholder, not video/i);
    expect(label, 'the region says it is not rendered here').toMatch(/not rendered in preview/i);
  }

  /*
    🔴 AND THE VISIBLE HALF IS ALWAYS SOMEWHERE ON CANVAS — on the region when it fits, on the
    stamp when it does not, and NEVER on a hover. That is the whole invariant, so it is what
    is asserted, per region, rather than "the label is present" (which the two-box seed would
    fail honestly) or "the label is absent" (which would pass on a broken large region).

    Measured on this seed at 1600 × 900: its two plates render 97.2 px and 72.9 px wide
    against a label that is a fixed 156.8 px, so BOTH degrade here and the stamp says so.
  */
  const stamp = page.locator('[data-stage-illustration]');
  let degraded = 0;
  for (let i = 0; i < count; i += 1) {
    const region = regions.nth(i);
    const box = await region.boundingBox();
    expect(box).not.toBeNull();
    const caveat = region.locator('[data-live-plate-caveat]');
    if ((await caveat.count()) === 1) {
      // It fits: the words are on the region, inside its own box, so a reader can tell WHICH
      // rect is a placeholder when there are several.
      await expect(caveat).toContainText('LIVE SOURCE · PLACEHOLDER');
      const c = await caveat.boundingBox();
      expect(c).not.toBeNull();
      expect(
        c!.width,
        'a rendered caveat that does not fit is a clipped caveat',
      ).toBeLessThanOrEqual(box!.width + 1);
    } else {
      degraded += 1;
    }
  }

  if (degraded > 0) {
    // The ONE allowed fallback: the stamp's own line. Permanent, on canvas, never a title.
    await expect(stamp).toHaveText('ILLUSTRATIVE COMPOSITE · LOCAL · LIVE SOURCES NOT RENDERED');
  }
  // …and it is never a hover in either branch: there is no disclosure control to press.
  await expect(page.getByRole('button', { name: /rehearsal does not prove/i })).toHaveCount(0);

  /*
    …and the region's mark sits BELOW the safe-area guides, so a guide line never reads as
    part of a placeholder. Asserted on the stacking the browser actually resolves.
  */
  await page.getByRole('button', { name: 'Toggle safe-area guides' }).click();
  await expect(page.locator('[data-pvw-guides]')).toHaveCount(1);
  const order = await page.evaluate(() => {
    const g = document.querySelector('[data-pvw-guides]');
    const o = document.querySelector('[data-live-plate-overlay]');
    if (!g || !o) return null;
    return {
      guides: Number(getComputedStyle(g).zIndex),
      overlay: Number(getComputedStyle(o).zIndex),
    };
  });
  expect(order).not.toBeNull();
  expect(order!.guides, 'the ruler must lie ON TOP of the placeholders').toBeGreaterThan(
    order!.overlay,
  );

  /*
    🔴 AND CAVEAT 1 IS ON THE STAMP, on canvas, in its first three words: ILLUSTRATIVE is
    not-pixel-identical and LOCAL is rendered-here-not-the-server's-output. Asserted as a
    PREFIX because the line may have taken caveat 2's words as well (above) — what must hold
    either way is that caveat 1 is stated, permanently and visibly.
  */
  await expect(stamp).toContainText('ILLUSTRATIVE COMPOSITE · LOCAL');
});
