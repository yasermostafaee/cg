import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` C (`R-075`) — **THE PLAYOUT'S PLAYLIST OUTPUT AS A BOX SOURCE, IN A REAL ENGINE.**
 *
 * The seeded Playout lists its playlist output (`خروجیِ پخش: …`, `route://1-7`, `playlistOf` channel 1) beside
 * its live inputs. Bound to the seeded row's first plate, the LIVE PLATES strip reads it LOCKED at 0 and every
 * audio control is disabled with `Programme sound is already on air`; the held plate beside it keeps its
 * controls (the control). The wire half — `VOLUME 0` before `PLAY`, a raise refused, nothing ever to layer 7 —
 * is `tools/caspar-bridge/tests/route-plates.integration.test.ts`; the jsdom twin is
 * `playlistAudioLock.dom.test.ts`. Windows runs are NON-authoritative (golden rule 12a).
 */

const PLAYLIST = {
  id: 'pl-apasai',
  name: 'خروجیِ پخش: آپاسای',
  producer: { kind: 'route', channel: 1, layer: 7, videoMode: '1080i5000' },
  compatibleChannels: [
    { casparHost: '127.0.0.1', casparChannel: 1 },
    { casparHost: '127.0.0.1', casparChannel: 2 },
  ],
  available: true,
  playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
} as const;

test.use({
  playoutSources: {
    ...E2E_PLAYOUT,
    inputs: { ...E2E_PLAYOUT.inputs, inputs: [...E2E_PLAYOUT.inputs.inputs, PLAYLIST] },
  },
});

const REASON = 'Programme sound is already on air';

test('the playlist output is an input under the Playout’s name; bound to a plate, its audio is LOCKED at 0 — control: the plate beside it keeps its controls', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  // Bind the seeded row's first plate to the playlist output, as its template's default.
  const bound = await page.evaluate(async () => {
    const w = window as unknown as {
      cg: {
        stack: { snapshot: () => Promise<{ itemId: string; templateId: string }[]> };
        sources: { setAssignments: (req: unknown) => Promise<{ ok: boolean; reason?: string }> };
      };
    };
    const row = (await w.cg.stack.snapshot()).find((r) => r.itemId === 'item-irib-news');
    if (row === undefined) return { ok: false, reason: 'no seeded row' };
    return w.cg.sources.setAssignments({
      assignments: [{ templateId: row.templateId, plateId: 'guest-1', sourceId: 'in-pl-apasai' }],
    });
  });
  expect(bound, JSON.stringify(bound)).toMatchObject({ ok: true });

  await app.liveSourcesTab.click();
  const box = app.liveSourceRow('1-60');
  await expect(box).toBeVisible();
  const strip = box.locator('[data-plate-audio="guest-1"]');
  await expect(strip.locator('.cg-plate-pill-label')).toHaveText('Locked · 0');
  await expect(strip.locator('input[type="range"]')).toBeDisabled();
  await expect(strip.locator('input[type="range"]')).toHaveAttribute('title', REASON);
  for (const label of ['ON', 'OFF', 'SOLO']) {
    const button = strip.getByRole('button', {
      name: new RegExp(label === 'ON' ? '^Full volume' : label === 'OFF' ? '^Silence' : '^Solo'),
    });
    await expect(button, label).toBeDisabled();
    await expect(button, label).toHaveAttribute('title', REASON);
  }
  const shotPath = test.info().outputPath('c-1-locked-audio-pill.png');
  await box.screenshot({ path: shotPath });
  await test.info().attach('c-1-locked-audio-pill', { path: shotPath, contentType: 'image/png' });

  // CONTROL — the held plate beside it is not the playlist output: its controls are live.
  const other = app.liveSourceRow('1-61').locator('[data-plate-audio="guest-2"]');
  await expect(other.locator('input[type="range"]')).toBeEnabled();
  await expect(other.locator('.cg-plate-pill-label')).not.toHaveText('Locked · 0');
});
