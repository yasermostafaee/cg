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

const ENTRY_SCRIPT = '**/assets/index-*.js';

async function openSplashWithoutBoot(page: Page): Promise<void> {
  await page.route(ENTRY_SCRIPT, (route) => route.abort());
  await page.goto('/');
}

test('startup animates while loading and dismissal begins in the actual boot callback', async ({
  page,
}) => {
  await armMockBoot(page);
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
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
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
  await openSplashWithoutBoot(page);

  // P-074/P-076 — the exact release identity is visible and explicitly labelled before boot.
  const stamp = (await splash(page).locator('#cg-splash-version').textContent())?.trim();
  expect(stamp).toMatch(
    new RegExp(`^Version ${VERSION.replaceAll('.', '\\.')} · Build date \\d{4}-\\d{2}-\\d{2}$`),
  );
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
    await openSplashWithoutBoot(page);
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

/**
 * 🔴 `CENTRAL-BRIDGE-01` — **IN CG CONTROL'S WINDOW THE SPLASH MAKES ITS ENTRANCE.** The app bundles
 * this page and shows it FIRST: there is no starting page before it any more, so nothing may skip the
 * entrance there. `FIELD-FIXES-01` J once did, for a window that showed a starting page while its
 * bridge started; that window is gone, and a skipped entrance there would now be the ONLY splash the
 * operator sees, arriving already in place. Measured by each entrance's own timing in a real engine —
 * jsdom runs no animation.
 */
test.describe('CENTRAL-BRIDGE-01 — the splash CG Control shows first', () => {
  /** Each staged element's entrance, as the engine resolved it. */
  async function entrances(
    page: Page,
  ): Promise<Record<string, { duration: string; opacity: string }>> {
    return page.evaluate(() => {
      const read = (selector: string): { duration: string; opacity: string } => {
        const el = document.querySelector(selector);
        if (el === null) throw new Error(`no element for ${selector}`);
        const style = getComputedStyle(el);
        return { duration: style.animationDuration, opacity: style.opacity };
      };
      return {
        scene: read('.cg-splash__scene'),
        wordmark: read('.cg-splash__wordmark'),
        company: read('.cg-splash__company'),
        tagline: read('.cg-splash__tagline'),
        progress: read('.cg-splash__progress'),
        foot: read('.cg-splash__foot'),
      };
    });
  }

  test('🔴 in the shell’s window the splash makes its entrance — nothing skips it', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // The shell's IPC global, as CG Control's webview has it before any page script runs.
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: () => Promise.reject(new Error('no shell in this test')),
      };
    });
    await armMockBoot(page);
    await openSplashWithoutBoot(page);
    await expect(splash(page)).toBeVisible();
    await expect(splash(page)).not.toHaveAttribute('data-continued', /.*/);
    const played = await entrances(page);
    for (const name of ['wordmark', 'company', 'tagline', 'progress', 'foot'] as const) {
      expect(played[name]?.duration, `${name} makes its entrance`).not.toBe('0s');
    }
    expect(played.wordmark?.duration).toBe('1s');
  });

  test('CONTROL — in a browser the splash makes its entrance, as it always has', async ({
    page,
  }) => {
    await armMockBoot(page);
    await openSplashWithoutBoot(page);
    await expect(splash(page)).toBeVisible();
    await expect(splash(page)).not.toHaveAttribute('data-continued', /.*/);
    const wordmark = (await entrances(page)).wordmark;
    expect(wordmark?.duration).toBe('1s');
  });
});
