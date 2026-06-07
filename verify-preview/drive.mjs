import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'verify-preview/shots/';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://127.0.0.1:4001/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// Open a starter that ships dynamic fields (Persian news) — fallback to Aurora.
const persian = page.getByRole('button', { name: /Persian News|خبری فارسی/ }).first();
if ((await persian.count()) > 0) await persian.click();
else await page.getByRole('button', { name: /Aurora Network/ }).first().click();
await page.waitForTimeout(1500);

await page.getByRole('button', { name: 'PREVIEW' }).click();
await page.waitForTimeout(1500); // load iframe + ResizeObserver scale

const dims = await page.evaluate(() => {
  const stage = document.querySelector('[aria-label="Composition preview"] iframe')?.parentElement;
  const frame = document.querySelector('[aria-label="Composition preview"] iframe');
  const sr = stage?.getBoundingClientRect();
  const fr = frame?.getBoundingClientRect();
  const card = document
    .querySelector('[aria-label="Composition preview"]')
    ?.getBoundingClientRect();
  return {
    modal: card ? { w: Math.round(card.width), h: Math.round(card.height) } : null,
    stage: sr ? { w: Math.round(sr.width), h: Math.round(sr.height) } : null,
    iframeOnScreen: fr ? { w: Math.round(fr.width), h: Math.round(fr.height) } : null,
  };
});
console.log('DIMS: ' + JSON.stringify(dims));
await page.screenshot({ path: OUT + 'preview-modal.png' });
await browser.close();
