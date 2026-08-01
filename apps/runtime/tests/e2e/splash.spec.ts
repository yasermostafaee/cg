import { expect, test, type Page } from '@playwright/test';

/**
 * R-035 — the startup splash, in a real browser.
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

/**
 * Record every distinct percentage the readout shows, IN THE PAGE, from first paint until
 * the splash removes itself.
 *
 * Sampled here rather than asserted with `toHaveText('100%')`, and the difference matters:
 * the splash shows 100% only for the ~450 ms fade before it deletes itself, so an assertion
 * that depends on Playwright's polling cadence landing inside that window passes on an idle
 * machine and fails on a loaded one. It did exactly that — polls landed at 40 %, 42 %, 44 %
 * and then the element was gone. A 40 ms in-page sampler cannot miss it, and it gives the
 * whole climb to assert over instead of one instant.
 */
async function recordPercentages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __CG_PCT_LOG__: string[] }).__CG_PCT_LOG__ = log;
    let seen = false;
    const tick = setInterval(() => {
      const el = document.getElementById('cg-splash-pct');
      if (el === null) {
        // Only STOP once the element has existed and then gone: this init script runs
        // before the document is parsed, so a null on the first ticks is "not yet".
        if (seen) clearInterval(tick);
        return;
      }
      seen = true;
      const text = el.textContent ?? '';
      if (log[log.length - 1] !== text) log.push(text);
    }, 40);
  });
}

/** The recorded climb, as numbers. */
async function recordedPercentages(page: Page): Promise<number[]> {
  const log = await page.evaluate(
    () => (window as unknown as { __CG_PCT_LOG__?: string[] }).__CG_PCT_LOG__ ?? [],
  );
  return log.map((value) => Number(value.replace('%', '')));
}

test('a cold start holds the splash for at least eight seconds; a reload in the same tab is shorter', async ({
  page,
}) => {
  await armMockBoot(page);

  // COLD — nothing in this context's session storage.
  const coldStartedAt = Date.now();
  await page.goto('/');
  await expect(splash(page)).toBeVisible();
  await expect(splash(page)).toHaveCount(0, { timeout: 25_000 });
  const coldHeldMs = Date.now() - coldStartedAt;
  expect(coldHeldMs).toBeGreaterThanOrEqual(8000);

  // WARM — same tab, so the session marker the first boot wrote is still there. Three
  // seconds is a brand moment on every load rather than a padded one, so the claim is that
  // it is honoured AND that it is visibly shorter than a cold start; an upper bound in
  // milliseconds would just be measuring this machine's navigation time.
  const warmStartedAt = Date.now();
  await page.reload();
  await expect(splash(page)).toHaveCount(0, { timeout: 25_000 });
  const warmHeldMs = Date.now() - warmStartedAt;
  expect(warmHeldMs).toBeGreaterThanOrEqual(3000);
  expect(warmHeldMs).toBeLessThan(coldHeldMs);

  // Gone means GONE — a full-screen overlay left in the DOM swallows clicks. `Layers` is
  // this branch's operator surface (it replaced the old `Stack` region); it is also what
  // `fixtures/runtime.ts` uses as its own post-boot barrier.
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
});

test('the phase label LEAVES on boot-done — the percentage carries the rest of the hold', async ({
  page,
}) => {
  await armMockBoot(page);
  await recordPercentages(page);
  await page.goto('/');

  const readout = splash(page).locator('#cg-splash-readout');
  const label = readout.locator('#cg-splash-phase');

  // The boot steps are real and fast against the mock, so by the time this runs the app
  // has committed and `done()` has fired — the label is on its way out. No terminal word
  // settles in its place.
  await expect(readout).toHaveAttribute('data-done', 'true');
  await expect(label).toHaveCSS('opacity', '0');
  await expect(splash(page)).not.toContainText(/\bready\b/i);

  await expect(splash(page)).toHaveCount(0, { timeout: 15_000 });

  // The percentage carried the hold on its own: it CLIMBED, it never went backwards, and it
  // arrived at exactly 100 — which is the moment the door opens and not a moment earlier.
  const climb = await recordedPercentages(page);
  expect(climb.length, 'the readout never moved').toBeGreaterThan(3);
  expect(climb).toEqual([...climb].sort((a, b) => a - b));
  expect(climb[0]).toBeLessThan(100);
  expect(climb.at(-1)).toBe(100);
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

    // The FULL PACKAGE — the scene's own resting state, since the graphics stack rather
    // than take turns. Both rows armed, strap, bug and ticker all live together.
    expect(frame.armedRow, 'the armed row is not shown').toBe('1');
    expect(frame.playTriangle, 'the PLAY triangle is not shown').toBe('1');
    expect(frame.lowerThird, 'the lower third is not on the monitor').toBe('1');
    expect(frame.secondRow, 'the second row is not armed').toBe('1');
    expect(frame.bug, 'the corner bug is not shown').toBe('1');
    expect(frame.ticker, 'the ticker is not shown').toBe('1');

    // The ONE thing a still frame cannot mean: a command dot frozen mid-wire depicts a
    // message in flight. Everything else here is a state, and a state can be held.
    expect(frame.commandDot).toBe('0');

    // …and the ambient raster sweep is gone entirely.
    expect(frame.scanDisplay).toBe('none');
  });
});
