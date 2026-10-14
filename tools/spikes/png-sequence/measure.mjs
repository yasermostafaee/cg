// PNG-SEQUENCE-IMPORT-01 §0 spike — the driver. Serves the page, opens it in system Chrome
// (Playwright from apps/designer), picks every PNG in <framesDir>, converts, and samples the
// whole browser's memory (the sum of the working sets of the Chrome processes Playwright
// launched — wasm linear memory included, which `performance.memory` does not count).
//
//   node tools/spikes/png-sequence/measure.mjs <framesDir> <outDir> [--copy]

import { createRequire } from 'node:module';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const [framesDir, outDir, ...flags] = process.argv.slice(2);
const copy = flags.includes('--copy');
const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const require = createRequire(join(REPO, 'apps/designer/package.json'));
const { chromium } = require('@playwright/test');
mkdirSync(outDir, { recursive: true });

const frames = readdirSync(framesDir)
  .filter((n) => /\.(png|tga|webp|jpe?g)$/i.test(n))
  .map((n) => join(framesDir, n));
const server = await serve(8198);
// Playwright's `Browser` exposes no pid; its own profile dir names THIS run's processes. A fresh
// dir per run, so no other Chrome on the machine is counted.
const profile = `cg-pngseq-${String(process.pid)}`;
const context = await chromium.launchPersistentContext(join(outDir, profile), {
  channel: 'chrome',
});

/** Sum of the working sets of every Chrome process running with this run's profile (MB). */
function browserMemoryMB() {
  const ps = `(Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | Measure-Object WorkingSetSize -Sum).Sum`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  const n = Number(out.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n / 1048576) : null;
}

let peakMB = 0;
let peakConvertMB = 0;
let converted = false;
let sampling = true;
const samples = [];
const page = context.pages()[0] ?? (await context.newPage());
const sampler = (async () => {
  while (sampling) {
    const mb = browserMemoryMB();
    if (!converted) {
      converted = await page.evaluate(() => window.__phase === 'converted').catch(() => converted);
    }
    if (mb !== null) {
      samples.push(mb);
      if (mb > peakMB) peakMB = mb;
      if (!converted && mb > peakConvertMB) peakConvertMB = mb;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
})();

await page.goto('http://127.0.0.1:8198/');
const baselineMB = browserMemoryMB();
await page.setInputFiles('#frames', frames);
if (copy) await page.check('#copy');
const t0 = Date.now();
await page.click('#run');
await page.waitForFunction(() => window.__result !== undefined, null, { timeout: 40 * 60_000 });
const wallMs = Date.now() - t0;
const result = await page.evaluate(() => window.__result);
const webm = await page.evaluate(() => window.__webm ?? null);
sampling = false;
await sampler;
await context.close();
server.close();

const cpu = execFileSync(
  'powershell',
  ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor).Name'],
  {
    encoding: 'utf8',
  },
).trim();
const report = {
  cpu,
  frames: frames.length,
  inputBytes: null,
  mode: copy ? 'MEMFS copy' : 'WORKERFS blobs',
  baselineBrowserMB: baselineMB,
  /** The whole browser at its highest DURING the conversion — the import's own cost. */
  peakDuringConvertMB: peakConvertMB,
  /** …and at its highest overall, including the spike handing the WebM back as base64. */
  peakBrowserMB: peakMB,
  wallMs,
  ...result,
};
writeFileSync(
  join(outDir, `result-${copy ? 'copy' : 'blobs'}.json`),
  JSON.stringify(report, null, 2),
);
if (webm !== null)
  writeFileSync(join(outDir, `out-${copy ? 'copy' : 'blobs'}.webm`), Buffer.from(webm, 'base64'));
console.log(JSON.stringify({ ...report, tail: undefined }, null, 2));
