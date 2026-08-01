import { expect, test, type Page } from '@playwright/test';

/**
 * R-031 — the startup splash, in a real browser.
 *
 * `test` comes from `@playwright/test` DIRECTLY and not from `./fixtures/runtime.js`,
 * and that is the whole opt-in mechanism: the shared harness arms
 * `__CG_SPLASH_DISABLED__` for every other spec so none of them pays the 5 s cold floor.
 * These specs want the splash, so they simply do not use that harness.
 *
 * A fresh Playwright context has empty `sessionStorage`, so every test here starts COLD
 * by construction — which is exactly the signal the splash reads.
 */

/** The splash element. It REMOVES itself when dismissed, so "gone" is a count of zero. */
function splash(page: Page) {
  return page.locator('#cg-splash');
}

/**
 * Boot deterministically against the offline mock, with the bridge probe pinned at a
 * guaranteed-dead port so a real `caspar-bridge` on this machine cannot make these specs
 * go live (the same pin the shared fixture uses, and for the same reason).
 */
async function armMockBoot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E: boolean }).CG_E2E = true;
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
    (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
  });
}

test('a cold start holds the splash for at least five seconds; a reload in the same tab does not', async ({
  page,
}) => {
  await armMockBoot(page);

  // COLD — nothing in this context's session storage.
  const coldStartedAt = Date.now();
  await page.goto('/');
  await expect(splash(page)).toBeVisible();
  await expect(splash(page)).toHaveCount(0, { timeout: 15_000 });
  const coldHeldMs = Date.now() - coldStartedAt;
  expect(coldHeldMs).toBeGreaterThanOrEqual(5000);

  // WARM — same tab, so the session marker the first boot wrote is still there. The
  // point of the short floor is that it stops a flash; it must not pad a fast reload.
  const warmStartedAt = Date.now();
  await page.reload();
  await expect(splash(page)).toHaveCount(0, { timeout: 15_000 });
  const warmHeldMs = Date.now() - warmStartedAt;
  expect(warmHeldMs).toBeLessThan(4000);
  expect(warmHeldMs).toBeLessThan(coldHeldMs);

  // Gone means GONE — a full-screen overlay left in the DOM swallows clicks.
  await expect(page.getByRole('region', { name: 'Stack' })).toBeVisible();
});

test('the phase label LEAVES on boot-done — the percentage carries the rest of the hold', async ({
  page,
}) => {
  await armMockBoot(page);
  await page.goto('/');

  const readout = splash(page).locator('#cg-splash-readout');
  const label = readout.locator('#cg-splash-phase');
  const pct = readout.locator('#cg-splash-pct');

  // The boot steps are real and fast against the mock, so by the time this runs the app
  // has committed and `done()` has fired — the label is on its way out. No terminal word
  // settles in its place.
  await expect(readout).toHaveAttribute('data-done', 'true');
  await expect(label).toHaveCSS('opacity', '0');
  await expect(splash(page)).not.toContainText(/\bready\b/i);

  // The percentage is still climbing the cold hold on its own, and it CLIMBS: two reads a
  // second apart on a 5 s floor cannot be equal unless the readout has stopped moving.
  const first = Number((await pct.textContent())?.replace('%', ''));
  expect(first).toBeLessThan(100);
  await page.waitForTimeout(1000);
  const second = Number((await pct.textContent())?.replace('%', ''));
  expect(second).toBeGreaterThan(first);

  // …and it arrives at 100 exactly as the door opens, never before.
  await expect(pct).toHaveText('100%', { timeout: 15_000 });
  await expect(splash(page)).toHaveCount(0, { timeout: 15_000 });
});

test('a refused bridge still dismisses the splash — the app shows its own NOT CONNECTED surface', async ({
  page,
}) => {
  // No `CG_E2E` here: this is the REAL backend, pointed at a port nothing answers on, so
  // bridge selection resolves to `disconnected`. That counts as resolved — the splash
  // must not wait for a link that will never come up, or the one install that most needs
  // to reach the UI is the one that never does.
  await page.addInitScript(() => {
    (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
  });

  await page.goto('/');
  await expect(splash(page)).toHaveCount(0, { timeout: 15_000 });

  const alert = page.getByRole('alert', { name: 'Bridge disconnected' });
  await expect(alert).toContainText('NOTHING CAN REACH AIR');
});

test('the foot carries a build stamp that identifies the running build', async ({ page }) => {
  await armMockBoot(page);
  await page.goto('/');

  // The SHAPE, never the literal — it changes every build. `nogit` is the documented
  // fallback for a tree built without `.git` (release tarball, Docker layer).
  const stamp = (await splash(page).locator('#cg-splash-version').textContent())?.trim();
  expect(stamp).toMatch(/^([0-9a-f]{7,}|nogit) · \d{4}-\d{2}-\d{2}$/);
});

test.describe('reduced motion', () => {
  test('renders the settled splash with no entrance animation', async ({ page }) => {
    // `page.emulateMedia` rather than the `reducedMotion` context option: the option did
    // NOT reach the page in this harness (the guard below caught it — `matchMedia` still
    // reported no-preference and every entrance animation ran), and a preference this
    // test is entirely about must be set by the mechanism that demonstrably works.
    // Before `goto`, so the very first paint is already the reduced one.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await armMockBoot(page);
    await page.goto('/');
    await expect(splash(page)).toBeVisible();

    const settled = await page.evaluate(() => {
      const read = (selector: string): { animationName: string; opacity: string } => {
        const el = document.querySelector(selector);
        if (el === null) throw new Error(`no element for ${selector}`);
        const style = getComputedStyle(el);
        return { animationName: style.animationName, opacity: style.opacity };
      };
      return {
        // Guard on the guard: without this the whole test passes vacuously the day the
        // emulation silently stops being applied.
        emulated: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        scene: read('.cg-splash__scene'),
        wordmark: read('.cg-splash__wordmark'),
        company: read('.cg-splash__company'),
        progress: read('.cg-splash__progress'),
        foot: read('.cg-splash__foot'),
      };
    });

    expect(settled.emulated, 'reduced-motion emulation is not active').toBe(true);

    // Every staggered element arrives already in place — no rise, no fade-in, and
    // nothing sitting at opacity 0 waiting for an animation that will not run.
    const { emulated: _emulated, ...elements } = settled;
    for (const [name, style] of Object.entries(elements)) {
      expect(style.animationName, `${name} still animates under reduced motion`).toBe('none');
      expect(style.opacity, `${name} is invisible under reduced motion`).toBe('1');
    }
  });

  test('the scene holds a FREEZE-FRAME that still tells the story, not a blank stage', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await armMockBoot(page);
    await page.goto('/');
    await expect(splash(page)).toBeVisible();

    const frame = await page.evaluate(() => {
      const opacityOf = (selector: string): string => {
        const el = document.querySelector(selector);
        if (el === null) throw new Error(`no element for ${selector}`);
        return getComputedStyle(el).opacity;
      };
      return {
        emulated: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        armedRow: opacityOf('.cg-splash__scene .hl1'),
        playTriangle: opacityOf('.cg-splash__scene .tri1'),
        lowerThird: opacityOf('.cg-splash__scene .lt'),
        secondRow: opacityOf('.cg-splash__scene .hl2'),
        commandDot: opacityOf('.cg-splash__scene .dot1'),
        bug: opacityOf('.cg-splash__scene .bug'),
        ticker: opacityOf('.cg-splash__scene .tk'),
        scanDisplay: getComputedStyle(document.querySelector('.cg-splash__scan') as Element)
          .display,
      };
    });

    expect(frame.emulated, 'reduced-motion emulation is not active').toBe(true);

    // The sentence a still frame can still say: row one armed, its lower third on air.
    expect(frame.armedRow, 'the armed row is not shown').toBe('1');
    expect(frame.playTriangle, 'the PLAY triangle is not shown').toBe('1');
    expect(frame.lowerThird, 'the lower third is not on the monitor').toBe('1');

    // The beats that only mean anything in motion stay off, rather than piling up as a
    // simultaneous jumble that never occurs during the loop itself.
    expect(frame.secondRow).toBe('0');
    expect(frame.commandDot).toBe('0');
    expect(frame.bug).toBe('0');
    expect(frame.ticker).toBe('0');

    // …and the ambient raster sweep is gone entirely.
    expect(frame.scanDisplay).toBe('none');
  });
});
