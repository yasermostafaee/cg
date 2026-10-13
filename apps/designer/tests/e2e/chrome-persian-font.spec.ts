import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './fixtures/designer.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 K / `B-263` — **PERSIAN IN THE DESIGNER'S CHROME RENDERS IN VAZIRMATN;
 * LATIN KEEPS EXO 2.** Measured in a real browser with CDP's `CSS.getPlatformFontsForNode` — the
 * font the engine actually drew with — never by reading CSS.
 *
 * `B-263`, as filed: the chrome stack is `'Exo 2', Inter, system-ui, …, 'Segoe UI', Vazirmatn`, and
 * on Windows `system-ui` has Arabic glyphs, so Persian chrome text never reached Vazirmatn. The fix
 * leads the stack with a chrome-only family of Vazirmatn's Arabic faces (`chromeFonts.css`).
 *
 * Probed where the chrome's two stacks apply: the app's own root (`App.css.ts`'s `page`) and the
 * document body (`index.css`, which portaled modals and tooltips inherit).
 *
 *   - The PROPERTY: Persian in either is drawn in Vazirmatn.
 *   - The CONTROL: Latin in either is drawn in exactly the font the OLD stack draws it in, at the
 *     same weight and size — measured on this machine, so "unchanged" holds on any platform.
 */

const OLD_STACK =
  '"Exo 2", Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif';

async function platformFonts(client: CDPSession, selector: string): Promise<string[]> {
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `no node for ${selector} — nothing below is measured`).toBeGreaterThan(0);
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((f) => f.familyName);
}

/** Probes that INHERIT the chrome stack of `host`, plus one set in the old stack for the control. */
async function plantProbes(page: Page, host: string, prefix: string): Promise<void> {
  const planted = await page.evaluate(
    ({ host, prefix, oldStack }) => {
      const parent = document.querySelector(host);
      if (parent === null) return false;
      const make = (attr: string, text: string, family?: string): void => {
        const span = document.createElement('span');
        span.setAttribute(attr, '');
        span.textContent = text;
        if (family !== undefined) span.style.fontFamily = family;
        parent.append(span);
      };
      make(`data-${prefix}-persian`, 'طراح گرافیک');
      make(`data-${prefix}-latin`, 'Composition');
      make(`data-${prefix}-old`, 'Composition', oldStack);
      return true;
    },
    { host, prefix, oldStack: OLD_STACK },
  );
  expect(planted, `the chrome host ${host} is on screen`).toBe(true);
}

test('B-263 — Persian in the chrome renders in Vazirmatn, and Latin keeps the font it used', async ({
  app,
}) => {
  const { page } = app;
  await plantProbes(page, '#root > *', 'app');
  await plantProbes(page, 'body', 'body');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');

  for (const prefix of ['app', 'body']) {
    const persian = await platformFonts(client, `[data-${prefix}-persian]`);
    expect(persian.join(', '), `Persian in the ${prefix} stack`).toMatch(/Vazirmatn/);

    const latin = await platformFonts(client, `[data-${prefix}-latin]`);
    const before = await platformFonts(client, `[data-${prefix}-old]`);
    expect(latin.length, `Latin in the ${prefix} stack was drawn at all`).toBeGreaterThan(0);
    expect(latin, `Latin in the ${prefix} stack keeps the font it used`).toEqual(before);
  }
});
