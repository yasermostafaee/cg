import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Browser coverage for the pre-bundle splash, with the bootstrap held only where needed. */

const VERSION = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

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

const ENTRY_SCRIPT = '**/assets/index-*.js';

async function openSplashWithoutBoot(page: Page): Promise<void> {
  await page.route(ENTRY_SCRIPT, (route) => route.abort());
  await page.goto('/');
}

test('startup animates while loading and dismissal begins in the actual boot callback', async ({
  page,
}) => {
  await armTestStorage(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(ENTRY_SCRIPT, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(splash(page)).toBeVisible();
    const sweep = await splash(page)
      .locator('.cg-splash__rail')
      .evaluate(async (node) => {
        const before = getComputedStyle(node, '::after').transform;
        for (let frame = 0; frame < 4; frame += 1) await new Promise(requestAnimationFrame);
        const style = getComputedStyle(node, '::after');
        return { before, after: style.transform, animation: style.animationName };
      });
    expect(sweep.animation).toBe('cg-load-sweep');
    expect(sweep.after).not.toBe(sweep.before);
    await expect(splash(page).locator('#cg-splash-pct')).toHaveText('0%');
    await page.evaluate(() => {
      const api = window.__CG_SPLASH__;
      if (api === undefined) throw new Error('No startup splash callback');
      const done = api.done;
      api.done = () => {
        done();
        const node = document.getElementById('cg-splash');
        const readout = document.getElementById('cg-splash-readout');
        document.documentElement.dataset['splashAtBoot'] = JSON.stringify({
          dismissing: node?.dataset['dismissing'],
          pointerEvents: node === null ? undefined : getComputedStyle(node).pointerEvents,
          progress: document.getElementById('cg-splash-pct')?.textContent,
          done: readout?.dataset['done'],
        });
      };
    });
  } finally {
    release();
  }
  await expect(page.locator('html')).toHaveAttribute(
    'data-splash-at-boot',
    JSON.stringify({ dismissing: 'true', pointerEvents: 'none', progress: '100%', done: 'true' }),
  );
  await expect(splash(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
});

test('the foot carries a build stamp that identifies the running build', async ({ page }) => {
  await armTestStorage(page);
  await openSplashWithoutBoot(page);

  // P-074/P-076 — the exact release identity is visible and explicitly labelled before boot.
  const stamp = (await splash(page).locator('#cg-splash-version').textContent())?.trim();
  expect(stamp).toMatch(
    new RegExp(`^Version ${VERSION.replaceAll('.', '\\.')} · Build date \\d{4}-\\d{2}-\\d{2}$`),
  );
});

test('the shared harness can bypass the splash', async ({ page }) => {
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
    await openSplashWithoutBoot(page);
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
    await openSplashWithoutBoot(page);
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
