import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` §4 — **LOOKS: the set is the template's own, and a switch keeps the
 * source on its frame.**
 *
 * ── WHAT THIS PROVES ON THE OPERATOR'S SURFACE ────────────────────────────────
 *
 * 1. **A template with an IRREGULAR look set renders exactly its own looks.** The e2e-armed
 *    library carries `e2e-looks-six`: SIX frames, FIVE looks of 1, 2, 3, 4 and 6 frames, word
 *    ids (`pair` places frames 2 and 5). The picker must show those five, in authored order,
 *    with each segment's thumbnail holding that look's own frames — and NO sixth segment. A
 *    picker that invented a look per frame count would show "5 frames"; one that numbered
 *    looks would show `1…5`; one that read the id would have nothing to read.
 * 2. **The strip's geometry is what the token home declares**, read in Chromium — jsdom has no
 *    layout (golden rule 12c), so the 38 px button, the 100 px floor and the 27 × 19 thumbnail
 *    can only be measured here.
 * 3. 🔴 **RED-FIRST: switch away and back — the same source is on the same frame.** Driven on
 *    PVW, where the console draws the join (`R-049`): a per-look input is bound through the
 *    Inspector, the placeholders' names AND boxes are read, the look is switched to one that
 *    places none of those frames and back, and every placeholder reads the same name in the
 *    same box. Red with the mock's switch dropping the row's per-look composition; green with
 *    it kept. The wire half is `tools/caspar-bridge/tests/look-switch-preserves-bindings…`.
 *
 * ⚠ Against the offline MockRuntime, which shares the bridge's validators. Windows runs are
 * NON-authoritative (golden rule 12a); the Linux `e2e` job is what discharges this.
 */

const SIX = 'e2e-looks-six';

/** The offline mock retains no page, so PVW needs a stand-in to have a frame at all. */
async function stubRetainedPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () =>
      Promise.resolve(
        `<!doctype html><html><head><style>
           html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent}
           .cg-stage{position:absolute;inset:0}
         </style></head><body><div class="cg-stage"></div>
         <script>window.play=function(){};window.stop=function(){};
                 window.update=function(){};window.next=function(){};</script>
         </body></html>`,
      );
  });
}

/** Two catalog inputs and the template default (level 2) for every frame of the six. */
async function seedSources(page: Page): Promise<void> {
  await page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: {
        sources: {
          setConfig: (req: unknown) => Promise<{ ok: boolean }>;
          setAssignments: (req: unknown) => Promise<{ ok: boolean }>;
        };
      };
    };
    await w.cg.sources.setConfig({
      sources: [
        { id: 'studio-1', name: 'Studio 1', producer: { kind: 'route', channel: 2 } },
        { id: 'studio-3', name: 'Studio 3', producer: { kind: 'route', channel: 4 } },
      ],
      layerRange: { start: 30, end: 39 },
    });
    await w.cg.sources.setAssignments({
      assignments: ['l-1', 'l-2', 'l-3', 'l-4', 'l-5', 'l-6'].map((plateId) => ({
        templateId,
        plateId,
        sourceId: 'studio-1',
      })),
    });
  }, SIX);
}

const px = (s: string): number => Number.parseFloat(s);
const round = (n: number): number => Math.round(n);

test('§4 — a six-frame template with five irregular looks renders exactly its own five', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  const layer = await app.loadTemplate(SIX);
  const picker = app.layerRow(layer).locator('[data-look-picker]');
  await expect(picker).toBeVisible();

  // THE SET — the template's five, in authored order, and nothing else.
  const segments = picker.locator('[data-look-id]');
  await expect(segments).toHaveCount(5);
  expect(
    await segments.evaluateAll((els) => els.map((e) => e.getAttribute('data-look-id'))),
  ).toEqual(['solo', 'pair', 'trio', 'quad', 'panel']);
  // THE NAMES are the authored names — not ordinals, not frame counts.
  await expect(segments.nth(1)).toHaveText('Pair');
  // THE FRAME COUNT is each look's OWN: 1, 2, 3, 4, 6 — six frames, five looks, no five-frame
  // look. The thumbnail draws exactly that many cells.
  const frames = await segments.evaluateAll((els) =>
    els.map((e) => ({
      declared: e.getAttribute('data-look-frames'),
      drawn: e.querySelectorAll('[data-look-frame]').length,
      cells: [...e.querySelectorAll('[data-look-frame]')].map((c) =>
        c.getAttribute('data-look-frame'),
      ),
    })),
  );
  expect(frames.map((f) => f.declared)).toEqual(['1', '2', '3', '4', '6']);
  expect(frames.map((f) => f.drawn)).toEqual([1, 2, 3, 4, 6]);
  // …and `pair` really is frames 2 and 5 — membership, not a count.
  expect(frames[1]?.cells).toEqual(['l-2', 'l-5']);
  expect(frames[3]?.cells).toEqual(['l-1', 'l-2', 'l-4', 'l-6']);
  // No look was invented from the frame count: nothing declares five frames.
  await expect(picker.locator('[data-look-frames="5"]')).toHaveCount(0);
  // The tooltip says the frame count in the operator's words and carries the id.
  await expect(segments.nth(1)).toHaveAttribute('title', '2 frames · pair');
  await expect(segments.nth(0)).toHaveAttribute('title', '1 frame · solo');
  // The AUTHORED default is what a fresh row marks — `trio`, the third, not the first.
  await expect(segments.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(1);
});

test('§4 — the look strip is exactly what the token home declares, measured in Chromium', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      btnH: read('--r-look-btn-h'),
      btnMinW: read('--r-look-btn-min-w'),
      btnPad: read('--r-look-btn-pad'),
      btnRadius: read('--r-look-btn-radius'),
      btnText: read('--r-look-btn-text'),
      btnGap: read('--r-look-btn-gap'),
      stripGap: read('--r-look-strip-gap'),
      ctxGap: read('--r-look-ctx-gap'),
      ctxMinW: read('--r-look-ctx-min-w'),
      thumbW: read('--r-look-thumb-w'),
      thumbH: read('--r-look-thumb-h'),
    };
  });
  // Non-empty FIRST, then identity (`PROMPT.md` §11).
  for (const [name, value] of Object.entries(tokens)) {
    expect(value, `${name} is declared`).not.toBe('');
  }

  const row = app.fixedRow(89); // the seeded look-bearing row
  await row.scrollIntoViewIfNeeded();
  const strip = await row.locator('[data-look-picker]').evaluate((line) => {
    const label = line.querySelector<HTMLElement>('[title]');
    const strip = line.querySelector<HTMLElement>('[data-look-strip]');
    const btns = [...line.querySelectorAll<HTMLElement>('[data-look-id]')].map((b) => {
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      const t = b.querySelector<HTMLElement>('[data-look-thumb]')?.getBoundingClientRect();
      return {
        h: r.height,
        w: r.width,
        minW: cs.minWidth,
        padding: cs.padding,
        radius: cs.borderRadius,
        fontSize: cs.fontSize,
        gap: cs.columnGap,
        thumbW: t?.width ?? 0,
        thumbH: t?.height ?? 0,
      };
    });
    return {
      lineGap: getComputedStyle(line).columnGap,
      labelMinW: label === null ? '' : getComputedStyle(label).minWidth,
      stripGap: strip === null ? '' : getComputedStyle(strip).columnGap,
      btns,
    };
  });

  expect(strip.btns.length, 'the seeded row has three looks').toBe(3);
  for (const [i, b] of strip.btns.entries()) {
    expect(round(b.h), `look ${String(i)} height`).toBe(px(tokens.btnH));
    expect(b.w, `look ${String(i)} is at least the floor`).toBeGreaterThanOrEqual(
      px(tokens.btnMinW) - 0.5,
    );
    expect(b.minW).toBe(tokens.btnMinW);
    expect(b.padding).toBe(tokens.btnPad);
    expect(b.radius).toBe(tokens.btnRadius);
    expect(b.fontSize).toBe(tokens.btnText);
    expect(b.gap).toBe(tokens.btnGap);
    expect(round(b.thumbW), `look ${String(i)} thumbnail width`).toBe(px(tokens.thumbW));
    expect(round(b.thumbH), `look ${String(i)} thumbnail height`).toBe(px(tokens.thumbH));
  }
  expect(strip.stripGap).toBe(tokens.stripGap);
  expect(strip.lineGap).toBe(tokens.ctxGap);
  expect(strip.labelMinW).toBe(tokens.ctxMinW);
});

const marker = (page: Page, plateId: string) => page.locator(`[data-live-plate="${plateId}"]`);

/** Name and box of every placeholder PVW draws, keyed by plate. */
async function placeholders(
  page: Page,
): Promise<Record<string, { name: string; box: { x: number; y: number; w: number; h: number } }>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[data-live-plate]')].map((el) => {
        const r = el.getBoundingClientRect();
        return [
          el.getAttribute('data-live-plate') ?? '',
          {
            name: el.textContent ?? '',
            box: {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            },
          },
        ];
      }),
    ),
  );
}

test('🔴 §4 — RED-FIRST: switch away and back, and the same source is on the same frame', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await seedSources(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(SIX);
  const row = app.layerRow(layer);
  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  await app.selectLayerRow(layer);

  // TRIO is the default: frames 1, 3 and 5 on the template default.
  await expect(marker(page, 'l-3')).toContainText('Studio 1');

  // The row's OWN composition for this look — frame 3 shows Studio 3 in TRIO. What a switch
  // that re-derived the frames from the template would lose.
  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await expect(looks).toBeVisible();
  await looks.locator('[data-look-binding="trio:l-3"]').selectOption('studio-3');
  await app.applyEdits();
  await expect(marker(page, 'l-3')).toContainText('Studio 3');

  const before = await placeholders(page);
  // Non-empty FIRST, then identity: three frames, each named and boxed.
  expect(Object.keys(before).sort()).toEqual(['l-1', 'l-3', 'l-5']);
  for (const p of Object.values(before)) {
    expect(p.box.w).toBeGreaterThan(0);
    expect(p.box.h).toBeGreaterThan(0);
  }
  expect(before['l-3']?.name).toContain('Studio 3');
  expect(before['l-1']?.name).toContain('Studio 1');

  // AWAY — to SOLO, which places only frame 1 (full raster).
  const seg = (id: string) => row.locator(`[data-look-id="${id}"]`);
  await seg('solo').click();
  await expect(seg('solo')).toHaveAttribute('aria-pressed', 'true');
  // POSITIVE CONTROL: the switch really moved the picture — frames 3 and 5 are gone and frame
  // 1 is a different box.
  await expect(marker(page, 'l-3')).toHaveCount(0);
  await expect(marker(page, 'l-5')).toHaveCount(0);
  await expect
    .poll(async () => (await placeholders(page))['l-1']?.box.w)
    .not.toBe(before['l-1']?.box.w);

  // …AND BACK.
  await seg('trio').click();
  await expect(seg('trio')).toHaveAttribute('aria-pressed', 'true');
  await expect(marker(page, 'l-3')).toContainText('Studio 3');

  // 🔴 THE PROPERTY — every frame TRIO places carries the same source in the same box,
  // including the one whose source is the row's own per-look binding.
  await expect.poll(async () => placeholders(page)).toEqual(before);
});
