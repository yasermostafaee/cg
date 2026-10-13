import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 K / `B-263` — **PERSIAN IN THE CHROME RENDERS IN VAZIRMATN; LATIN KEEPS
 * THE FONT IT USES TODAY.** Measured in a real browser with CDP's `CSS.getPlatformFontsForNode` —
 * the font the engine actually drew the glyphs with — never by reading CSS.
 *
 * The chrome stack reached `system-ui` before Vazirmatn, and on Windows `system-ui` has Arabic
 * glyphs, so Persian labels rendered in Segoe UI. The fix leads the stack with a chrome-only family
 * of Vazirmatn's Arabic faces (`chromeFonts.css`), which claims only the Arabic ranges.
 *
 *   - The PROPERTY: a real Persian label — the seeded row name «میانبرنامه روی انتن» — is drawn
 *     in Vazirmatn.
 *   - The CONTROL: a real Latin label — the row name `CLOCK` — is drawn in exactly the font a probe
 *     set in the OLD stack is drawn in, at the label's own weight and size. "Unchanged" is
 *     measured against the old stack on THIS machine, so it holds on any platform CI runs on.
 */

/** The stack as it was before `B-263`, for the Latin control. */
const OLD_STACK =
  'Inter, system-ui, -apple-system, "Segoe UI", Vazirmatn, "Noto Sans Arabic", sans-serif';

async function platformFonts(client: CDPSession, selector: string): Promise<string[]> {
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `no node for ${selector} — nothing below is measured`).toBeGreaterThan(0);
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((f) => f.familyName);
}

/** Tag the element whose OWN text is `text`, inside `scope`, so CDP can address it. */
async function tagLabel(page: Page, scope: string, text: string, tag: string): Promise<void> {
  const found = await page.evaluate(
    ({ scope, text, tag }) => {
      const within = document.querySelector(scope);
      if (within === null) return false;
      const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if (n.textContent?.trim() === text && n.parentElement !== null) {
          n.parentElement.setAttribute(tag, '');
          return true;
        }
      }
      return false;
    },
    { scope, text, tag },
  );
  expect(found, `the label “${text}” is on screen`).toBe(true);
}

test('B-263 — a Persian label renders in Vazirmatn, and a Latin label keeps the font it used', async ({
  app,
}) => {
  const { page } = app;
  const persianName = 'میانبرنامه روی انتن';
  await expect(page.locator('[data-layer="83"]')).toContainText(persianName);
  await expect(page.locator('[data-layer="80"]')).toContainText('CLOCK');
  await tagLabel(page, '[data-layer="83"]', persianName, 'data-probe-persian');
  await tagLabel(page, '[data-layer="80"]', 'CLOCK', 'data-probe-latin');

  // The OLD stack, in a probe beside the Latin label, at the label's own weight and size.
  await page.evaluate((oldStack) => {
    const label = document.querySelector('[data-probe-latin]');
    if (label === null) return;
    const cs = getComputedStyle(label);
    const probe = document.createElement('span');
    probe.setAttribute('data-probe-old-stack', '');
    probe.textContent = 'CLOCK';
    probe.style.fontFamily = oldStack;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontStyle = cs.fontStyle;
    label.parentElement?.append(probe);
  }, OLD_STACK);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');

  const persian = await platformFonts(client, '[data-probe-persian]');
  expect(persian.join(', '), 'the Persian label').toMatch(/Vazirmatn/);

  const latin = await platformFonts(client, '[data-probe-latin]');
  const before = await platformFonts(client, '[data-probe-old-stack]');
  expect(latin.length, 'the Latin label was drawn at all').toBeGreaterThan(0);
  expect(latin, 'the Latin label keeps the font the old stack gives it').toEqual(before);
});
