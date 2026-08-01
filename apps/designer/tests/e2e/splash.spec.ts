import { expect, test, type Page } from '@playwright/test';

/**
 * The Designer's startup splash, in a real browser.
 *
 * `test` comes from `@playwright/test` DIRECTLY and not from `./fixtures/designer.js`, and
 * that is the whole opt-in mechanism: the shared harness arms `__CG_SPLASH_DISABLED__` for
 * every other spec so none of them pays the cold floor. These specs want the splash, so they
 * simply do not use that harness.
 *
 * A fresh Playwright context has empty `sessionStorage`, so every test here starts COLD by
 * construction — which is exactly the signal the splash reads.
 */

/** The splash element. It REMOVES itself when dismissed, so "gone" is a count of zero. */
function splash(page: Page) {
  return page.locator('#cg-splash');
}

/** Boot into isolated in-memory storage, the way every other Designer spec does. */
async function armTestStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E: boolean }).CG_E2E = true;
  });
}

test('a cold start holds the splash for at least eight seconds; a reload in the same tab is shorter', async ({
  page,
}) => {
  await armTestStorage(page);

  // COLD — nothing in this context's session storage.
  const coldStartedAt = Date.now();
  await page.goto('/');
  await expect(splash(page)).toBeVisible();
  await expect(splash(page)).toHaveCount(0, { timeout: 25_000 });
  const coldHeldMs = Date.now() - coldStartedAt;
  expect(coldHeldMs).toBeGreaterThanOrEqual(8000);

  // WARM — same tab, so the session marker the first boot wrote is still there. Three
  // seconds is a brand moment on every load, not a padded one: it must still be visibly
  // shorter than the cold hold.
  const warmStartedAt = Date.now();
  await page.reload();
  await expect(splash(page)).toHaveCount(0, { timeout: 25_000 });
  const warmHeldMs = Date.now() - warmStartedAt;
  expect(warmHeldMs).toBeGreaterThanOrEqual(3000);
  expect(warmHeldMs).toBeLessThan(coldHeldMs);

  // Gone means GONE — a full-screen overlay left in the DOM swallows clicks.
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible({ timeout: 30_000 });
});

test('the phase label LEAVES on boot-done — the percentage carries the rest of the hold', async ({
  page,
}) => {
  await armTestStorage(page);
  await page.goto('/');

  const readout = splash(page).locator('#cg-splash-readout');
  const label = readout.locator('#cg-splash-phase');
  const pct = readout.locator('#cg-splash-pct');

  // The boot steps are real and fast against in-memory storage, so by the time this runs the
  // app has committed and `done()` has fired — the label is on its way out. No terminal word
  // settles in its place.
  await expect(readout).toHaveAttribute('data-done', 'true');
  await expect(label).toHaveCSS('opacity', '0');
  await expect(splash(page)).not.toContainText(/\bready\b/i);

  // The percentage climbs the hold on its own: two reads a second apart on an 8 s floor
  // cannot be equal unless the readout has stopped moving.
  const first = Number((await pct.textContent())?.replace('%', ''));
  expect(first).toBeLessThan(100);
  await page.waitForTimeout(1000);
  const second = Number((await pct.textContent())?.replace('%', ''));
  expect(second).toBeGreaterThan(first);

  // …and it arrives at 100 exactly as the door opens, never before.
  await expect(pct).toHaveText('100%', { timeout: 25_000 });
  await expect(splash(page)).toHaveCount(0, { timeout: 25_000 });
});

test('the foot carries a build stamp that identifies the running build', async ({ page }) => {
  await armTestStorage(page);
  await page.goto('/');

  // The SHAPE, never the literal — it changes every build. `nogit` is the documented
  // fallback for a tree built without `.git` (release tarball, Docker layer).
  const stamp = (await splash(page).locator('#cg-splash-version').textContent())?.trim();
  expect(stamp).toMatch(/^([0-9a-f]{7,}|nogit) · \d{4}-\d{2}-\d{2}$/);
});

test('the shared harness turns the splash OFF, so no other spec pays the floor', async ({
  page,
}) => {
  // The mirror image of every test above: with the fixture's global set, the splash is a
  // complete no-op and the app is reachable immediately.
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E: boolean }).CG_E2E = true;
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
  });
  await page.goto('/');
  await expect(splash(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible({ timeout: 30_000 });
});

test.describe('reduced motion', () => {
  test('renders the settled splash with no entrance animation', async ({ page }) => {
    // `page.emulateMedia` rather than the `reducedMotion` context option: the option does NOT
    // reach the page in this harness, and a preference this test is entirely about must be
    // set by the mechanism that demonstrably works. The guard below is what catches it.
    // Before `goto`, so the very first paint is already the reduced one.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await armTestStorage(page);
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
        board: read('.cg-splash__board'),
      };
    });

    expect(settled.emulated, 'reduced-motion emulation is not active').toBe(true);

    const { emulated: _emulated, ...elements } = settled;
    for (const [name, style] of Object.entries(elements)) {
      expect(style.animationName, `${name} still animates under reduced motion`).toBe('none');
      expect(style.opacity, `${name} is invisible under reduced motion`).toBe('1');
    }
  });

  test('the artboard renders its COMPLETE composition — not a blank band or a half-built frame', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await armTestStorage(page);
    await page.goto('/');
    await expect(splash(page)).toBeVisible();

    const frame = await page.evaluate(() => {
      const style = (selector: string): CSSStyleDeclaration => {
        const el = document.querySelector(selector);
        if (el === null) throw new Error(`no element for ${selector}`);
        return getComputedStyle(el);
      };
      return {
        emulated: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        pathOffset: style('.cg-splash__scene .path').strokeDashoffset,
        keyframes: ['kf1', 'kf2', 'kf3', 'kf4'].map(
          (k) => style(`.cg-splash__scene .${k}`).opacity,
        ),
        keyframeTransform: style('.cg-splash__scene .kf1').transform,
        strap: style('.cg-splash__scene .strap').opacity,
        line1: style('.cg-splash__scene .l1').opacity,
        bug: style('.cg-splash__scene .bug').opacity,
        ticker: style('.cg-splash__scene .tick').opacity,
        dot: style('.cg-splash__scene .dot').opacity,
        playhead: style('.cg-splash__scene .head').opacity,
        scan: style('.cg-splash__scan').display,
      };
    });

    expect(frame.emulated, 'reduced-motion emulation is not active').toBe(true);

    // The path is fully drawn.
    expect(frame.pathOffset).toBe('0px');
    // All four keyframes are placed, and still turned 45° — a diamond that snaps square is a
    // different mark, not the same one held still.
    expect(frame.keyframes).toEqual(['1', '1', '1', '1']);
    expect(frame.keyframeTransform).not.toBe('none');
    // The lower third is fully assembled.
    expect(frame.strap).toBe('1');
    expect(frame.line1).toBe('1');
    expect(frame.bug).toBe('1');
    expect(frame.ticker).toBe('1');
    expect(frame.dot).toBe('1');
    // The playhead is parked, not gone.
    expect(Number(frame.playhead)).toBeGreaterThan(0);
    // …and the ambient raster sweep is off entirely.
    expect(frame.scan).toBe('none');
  });
});
