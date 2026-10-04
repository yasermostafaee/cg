import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { createBridge } from '@cg/caspar-bridge';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `R-087` (`RELEASE-0112-01-A`) — **THE NOT CONNECTED BANNER: NO WAY INTO TEST MODE (A1), AND
 * ACTIONS DRAWN FOR RED (A2), MEASURED IN CHROMIUM.**
 *
 * Golden rule 12 c: a colour claim is measured in a real engine. Every number below is
 * `getComputedStyle` in Chromium over the real stylesheet, in each state the operator can put a
 * button in — rest, hover, pressed, keyboard focus, disabled — never read off the token names.
 *
 *   - text ≥ 4.5 : 1 against what it stands on (its own fill when it has one, else the banner);
 *   - the focus ring ≥ 3 : 1 against the banner;
 *   - no blue: no colour of either button, in any state, has a blue hue.
 *
 * `CG_SHOTS_DIR` set: the screenshots the delta asks for are written there (the report's after
 * pictures); unset, nothing is written.
 *
 * ⚠ "Set up again" is CG Control's alone (`setup.canSetPlayoutAddress()` is false in a browser), so
 * the page is told it runs inside CG Control by one init-script shim on `window.cg.setup` — the same
 * door the desktop shell opens; everything else is the shipped build.
 */

const SHOTS = process.env['CG_SHOTS_DIR'];

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parse(css: string): Rgba {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (m === null) throw new Error(`not a colour: ${css}`);
  const parts = (m[1] ?? '').split(/[\s,/]+/).filter((p) => p !== '');
  const [r, g, b, a] = parts.map(Number);
  return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: a ?? 1 };
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + under.r * (1 - a),
    g: top.g * a + under.g * (1 - a),
    b: top.b * a + under.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(x: Rgba, y: Rgba): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** A blue hue: 180°–260°, saturated enough to read as a colour (the console's sky is ~199°). */
function isBlue(c: Rgba): boolean {
  if (c.a === 0) return false;
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max === 0 || d / max < 0.25) return false;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  const deg = (h * 60 + 360) % 360;
  return deg >= 180 && deg <= 260;
}

interface Paint {
  color: string;
  background: string;
  border: string;
  outline: string;
  outlineStyle: string;
  shadow: string;
}

/**
 * The paint once every transition on the button has finished — `.cg-btn` eases its fill, edge and
 * filter, and a read taken at once catches the colour mid-flight (measured: a white fill read at
 * 0.88 alpha on the disabled state's first spelling of this spec).
 */
const paintOf = (button: Locator): Promise<Paint> =>
  button.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
    const s = getComputedStyle(el);
    return {
      color: s.color,
      background: s.backgroundColor,
      border: s.borderTopColor,
      outline: s.outlineColor,
      outlineStyle: s.outlineStyle,
      shadow: s.boxShadow,
    };
  });

const colourIn = (shadow: string): string[] => shadow.match(/rgba?\([^)]+\)/g) ?? [];

/** Every transition inside `host` finished — before a picture, so none is taken mid-fade. */
const settle = (host: Locator): Promise<void> =>
  host.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
    );
  });

/**
 * Land on `target` BY KEYBOARD, so it matches `:focus-visible`: focus it, step back one with
 * Shift+Tab, and Tab onto it again — independent of how many controls the page holds before it.
 */
async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  if (!(await target.evaluate((el) => el === document.activeElement))) {
    throw new Error('the button was not reached by Tab');
  }
}

async function deadBridgeUrl(): Promise<string> {
  const probe = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
  });
  const url = probe.url;
  await probe.close();
  return url;
}

/** The page as CG Control shows it: a dead CG Bridge, and the desktop shell's Set up again. */
async function openNotConnected(page: Page): Promise<{ forgets: () => Promise<number> }> {
  const url = await deadBridgeUrl();
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.addInitScript((bridgeUrl) => {
    (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = bridgeUrl;
    let held: unknown;
    Object.defineProperty(window, 'cg', {
      configurable: true,
      get: () => held,
      set: (v: {
        setup: { canSetPlayoutAddress: () => boolean; forgetStation: () => boolean };
      }) => {
        v.setup.canSetPlayoutAddress = () => true;
        // Counted in sessionStorage: Set up again reloads the page, and a count kept on `window`
        // would be reset by this very script on the reload.
        v.setup.forgetStation = () => {
          const n = Number(sessionStorage.getItem('e2e.forgets') ?? '0');
          sessionStorage.setItem('e2e.forgets', String(n + 1));
          return true;
        };
        held = v;
      },
    });
  }, url);
  await page.goto('/');
  return {
    forgets: () => page.evaluate(() => Number(sessionStorage.getItem('e2e.forgets') ?? '0')),
  };
}

type State = 'rest' | 'hover' | 'pressed' | 'focus' | 'disabled';

/** Put `button` in `state`, read its paint, and put it back. */
async function paintIn(page: Page, button: Locator, state: State): Promise<Paint> {
  await page.mouse.move(0, 790);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  switch (state) {
    case 'rest':
      return paintOf(button);
    case 'hover': {
      await button.hover();
      return paintOf(button);
    }
    case 'pressed': {
      await button.hover();
      await page.mouse.down();
      const paint = await paintOf(button);
      // Off the button before release, so the press is not a click.
      await page.mouse.move(0, 790);
      await page.mouse.up();
      return paint;
    }
    case 'focus': {
      await focusByKeyboard(page, button);
      expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
      return paintOf(button);
    }
    case 'disabled': {
      await button.evaluate((el) => el.setAttribute('disabled', ''));
      const paint = await paintOf(button);
      await button.evaluate((el) => el.removeAttribute('disabled'));
      return paint;
    }
  }
}

test.describe('R-087 — the NOT CONNECTED banner', () => {
  test('A1 — no "Enter test mode" anywhere on the page; CONTROL: Set up again forgets the station and Retry connection starts the console again', async ({
    page,
  }) => {
    const { forgets } = await openNotConnected(page);
    const banner = page.getByRole('alert', { name: 'Bridge disconnected' });
    await expect(banner).toContainText('NOTHING CAN REACH AIR');
    await expect(banner.getByRole('button', { name: 'Retry connection' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Set up again' })).toBeVisible();
    // The absence, page-wide, by text and by role — case-insensitive, as a spec pins copy.
    await expect(page.getByText(/test mode/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /test mode/i })).toHaveCount(0);

    // CONTROL — each action still does its job: Set up again forgets the station and starts again…
    expect(await forgets()).toBe(0);
    const restarted = page.waitForEvent('load');
    await banner.getByRole('button', { name: 'Set up again' }).click();
    await restarted;
    expect(await forgets()).toBe(1);
    // …and Retry connection starts the console again.
    const again = page.getByRole('alert', { name: 'Bridge disconnected' });
    await expect(again).toBeVisible();
    const reloaded = page.waitForEvent('load');
    await again.getByRole('button', { name: 'Retry connection' }).click();
    await reloaded;
    await expect(page.getByRole('alert', { name: 'Bridge disconnected' })).toBeVisible();
  });

  test('A2 — every action on the red is drawn for red: text ≥ 4.5 : 1, the focus ring ≥ 3 : 1, no blue — in every state', async ({
    page,
  }) => {
    await openNotConnected(page);
    const banner = page.getByRole('alert', { name: 'Bridge disconnected' });
    await expect(banner).toBeVisible();
    const ground = parse(await banner.evaluate((el) => getComputedStyle(el).backgroundColor));
    // The banner IS the alarm red — the instrument reads the surface it claims to.
    expect(ground).toEqual({ r: 153, g: 27, b: 27, a: 1 });

    const measured: string[] = [];
    const buttons = [
      { name: 'Retry connection', first: true },
      { name: 'Set up again', first: false },
    ] as const;
    for (const { name, first } of buttons) {
      const button = banner.getByRole('button', { name });
      for (const state of ['rest', 'hover', 'pressed', 'focus', 'disabled'] as const) {
        const p = await paintIn(page, button, state);
        const fill = over(parse(p.background), ground);
        const ink = over(parse(p.color), fill);
        const text = contrast(ink, fill);
        measured.push(`${name} · ${state}: text ${text.toFixed(2)} : 1`);
        expect(text, `${name} ${state}: ${p.color} on ${p.background}`).toBeGreaterThanOrEqual(4.5);
        // No blue in any colour this button paints, in this state.
        for (const c of [p.color, p.background, p.border, p.outline, ...colourIn(p.shadow)]) {
          expect(isBlue(parse(c)), `${name} ${state} paints blue: ${c}`).toBe(false);
        }
        if (state === 'focus') {
          expect(p.outlineStyle).toBe('solid');
          const ring = contrast(over(parse(p.outline), ground), ground);
          measured.push(`${name} · focus ring: ${ring.toFixed(2)} : 1 against the banner`);
          expect(ring).toBeGreaterThanOrEqual(3);
        }
        if (first && state === 'rest') {
          // The first action is the light one: its fill stands off the red.
          const edge = contrast(fill, ground);
          measured.push(`${name} · fill against the banner: ${edge.toFixed(2)} : 1`);
          expect(edge).toBeGreaterThanOrEqual(3);
        }
      }
    }
    test.info().annotations.push({ type: 'contrast', description: measured.join('\n') });
    process.stdout.write(`[R-087 contrast]\n${measured.join('\n')}\n`);

    if (SHOTS !== undefined) {
      await page.mouse.move(0, 790);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await settle(banner);
      await banner.screenshot({
        path: path.join(SHOTS, 'RELEASE-0112-01-A-banner-after-not-connected.png'),
      });
      await focusByKeyboard(page, banner.getByRole('button', { name: 'Retry connection' }));
      await settle(banner);
      await banner.screenshot({
        path: path.join(SHOTS, 'RELEASE-0112-01-A-banner-after-not-connected-focus.png'),
      });
    }
  });

  test('A2 — the amber banners are drawn for amber already: measured, and left as they are', async ({
    app,
  }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.addInitScript(() => {
      (window as unknown as { CG_E2E_ORPHAN: boolean }).CG_E2E_ORPHAN = true;
    });
    await page.reload();
    const banner = page.getByRole('alert', { name: 'Orphaned on-air layers' });
    await expect(banner).toBeVisible();
    const measured: string[] = [];
    const clear = banner.getByRole('button', { name: 'Clear layer 1-60' });
    // The strip the CLEAR stands on: its nearest painted ancestor.
    const groundOf = (el: Locator): Promise<string> =>
      el.evaluate((node) => {
        let at: Element | null = node.parentElement;
        while (at !== null) {
          const bg = getComputedStyle(at).backgroundColor;
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
          at = at.parentElement;
        }
        return 'rgb(0, 0, 0)';
      });
    const ground = parse(await groundOf(clear));
    for (const state of ['rest', 'hover', 'focus'] as const) {
      const p = await paintIn(page, clear, state);
      const fill = over(parse(p.background), ground);
      const text = contrast(over(parse(p.color), fill), fill);
      measured.push(`amber CLEAR · ${state}: text ${text.toFixed(2)} : 1`);
      expect(text).toBeGreaterThanOrEqual(4.5);
      if (state === 'focus') {
        const ring = colourIn(p.shadow)[0];
        expect(ring, 'the focus ring').toBeDefined();
        const r = contrast(over(parse(ring ?? ''), ground), ground);
        measured.push(`amber CLEAR · focus ring: ${r.toFixed(2)} : 1 against the strip`);
        expect(r).toBeGreaterThanOrEqual(3);
      }
    }
    if (SHOTS !== undefined) {
      await page.mouse.move(0, 790);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await settle(banner);
      await banner.screenshot({
        path: path.join(SHOTS, 'RELEASE-0112-01-A-banner-after-amber.png'),
      });
      await focusByKeyboard(page, clear);
      await settle(banner);
      await banner.screenshot({
        path: path.join(SHOTS, 'RELEASE-0112-01-A-banner-after-amber-focus.png'),
      });
    }

    // The caution ground's other two actions (`BridgeSessionBanner`'s `neutral` "Sign in CG
    // Bridge…", `EmptiedAirNotice`'s `ghost` DISMISS) — the real stylesheet's cascade on a strip in
    // the caution tone, since neither renders in the offline console.
    const probe = await page.evaluate(() => {
      const strip = document.createElement('div');
      strip.setAttribute('data-tone', 'caution');
      strip.style.background = 'var(--r-caution-bg)';
      strip.style.color = 'var(--r-caution-text)';
      const out: Record<string, { color: string; background: string }> = {};
      for (const variant of ['neutral', 'ghost']) {
        const b = document.createElement('button');
        b.className = `cg-btn cg-btn--${variant}`;
        b.textContent = variant;
        strip.appendChild(b);
      }
      document.body.appendChild(strip);
      for (const b of strip.querySelectorAll('button')) {
        const s = getComputedStyle(b);
        out[b.textContent ?? ''] = { color: s.color, background: s.backgroundColor };
      }
      const ground = getComputedStyle(strip).backgroundColor;
      strip.remove();
      return { out, ground };
    });
    const caution = parse(probe.ground);
    for (const [variant, p] of Object.entries(probe.out)) {
      const fill = over(parse(p.background), caution);
      const text = contrast(over(parse(p.color), fill), fill);
      measured.push(`amber ${variant} · rest: text ${text.toFixed(2)} : 1`);
      expect(text).toBeGreaterThanOrEqual(4.5);
    }
    test.info().annotations.push({ type: 'contrast', description: measured.join('\n') });
    process.stdout.write(`[R-087 amber]\n${measured.join('\n')}\n`);
  });
});
