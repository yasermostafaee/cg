/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B3 — **THE PERSIAN INSTALL GUIDE, BUILT INTO A PDF BY CHROMIUM** from its
 * markdown source (`docs/release/<version>/install-guide.fa.md`), right to left, in the repo's own
 * Vazirmatn (`apps/runtime/public/fonts/vazirmatn`, the faces the console ships — declared as the app
 * declares them: the latin subset, then the arabic subset limited by its `unicode-range`).
 *
 * Everything the page needs is INLINED — both fonts and every picture as a `data:` URI — so the PDF is
 * built with no request leaving the machine, and a font that did not load stops the build rather than
 * printing in a fallback face (checked before printing: `document.fonts.check`).
 *
 *   node tools/release/src/build-guide.mjs <guide.md> --out <file.pdf>
 *
 * The Chromium is Playwright's; `CG_PDF_CHANNEL` picks it (default `chrome`, the installed Chrome — what
 * the Windows runner has and a developer's machine has; the bundled one is fetched nowhere here).
 */
// The two probes that read the page's fonts run INSIDE Chromium (through `page.evaluate`), not Node.
/* global document */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownToHtml } from './markdown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '..', '..', '..');
const FONTS = path.join(REPO, 'apps', 'runtime', 'public', 'fonts', 'vazirmatn');
/** The arabic subset's range — the same list the console's `fonts.css` gives it. */
const ARABIC_RANGE = 'U+0600-06FF, U+200C-200D, U+FB50-FDFF, U+FE70-FEFF';
const WEIGHTS = [400, 500, 700];

function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** The six `@font-face` rules, each with its face inlined. */
export function fontFaces() {
  const face = (subset, weight, range) =>
    `@font-face{font-family:'Vazirmatn';font-style:normal;font-weight:${String(weight)};` +
    `${range === null ? '' : `unicode-range:${range};`}` +
    `src:url('${dataUri(path.join(FONTS, `vazirmatn-${subset}-${String(weight)}-normal.woff2`), 'font/woff2')}') format('woff2');}`;
  return [
    ...WEIGHTS.map((w) => face('latin', w, null)),
    ...WEIGHTS.map((w) => face('arabic', w, ARABIC_RANGE)),
  ].join('\n');
}

const STYLE = `
@page { size: A4; margin: 13mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
html { font-family: 'Vazirmatn', sans-serif; font-size: 9.6pt; line-height: 1.62; color: #141a23; }
body { margin: 0; }
h1 { font-size: 16pt; font-weight: 700; margin: 0 0 1mm; color: #0b2a44; }
h1 + p { margin: 0 0 3mm; color: #4a5566; }
h2 { font-size: 11.2pt; font-weight: 700; margin: 4mm 0 1.2mm; color: #0b2a44;
     border-bottom: 0.4mm solid #d9e2ec; padding-bottom: 0.6mm; break-after: avoid; }
p { margin: 0 0 1.6mm; }
ul, ol { margin: 0 0 1.6mm; padding-inline-start: 6mm; }
ol { list-style-type: persian; }
.figures { display: flex; gap: 3mm; align-items: flex-start; margin: 1.5mm 0 3mm; }
.figures figure { margin: 0; }
figure.side { float: left; margin: 0.6mm 4mm 2mm 0; }
h2 { clear: both; }
li { margin: 0 0 0.8mm; }
strong { font-weight: 700; }
bdi.ui { font-family: 'Vazirmatn', sans-serif; font-weight: 500; background: #eef2f7;
         border: 0.25mm solid #d3dbe6; border-radius: 1mm; padding: 0 1.2mm; white-space: nowrap; }
mark.confirm { background: #fff1c2; color: #5c4400; border-radius: 1mm; padding: 0 1mm;
               font-size: 8.4pt; white-space: nowrap; }
figure { margin: 1.5mm 0 3mm; break-inside: avoid; }
figure img { display: block; width: 100%; border: 0.3mm solid #c9d3df; border-radius: 1.2mm; }
figcaption { font-size: 8.2pt; color: #4a5566; margin-top: 0.8mm; }
`;

/** The whole page: RTL, Persian, the fonts and the pictures inlined. */
export function guideHtml(markdownFile) {
  const markdown = fs.readFileSync(markdownFile, 'utf8');
  const dir = path.dirname(markdownFile);
  const body = markdownToHtml(markdown, (src) => {
    const file = path.resolve(dir, src);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
    if (mime === null) throw new Error(`the guide embeds ${src}, which is not a PNG or JPEG`);
    return dataUri(file, mime);
  });
  const title = /^#\s+(.*)$/m.exec(markdown)?.[1] ?? 'APASAI CG';
  return (
    `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">` +
    `<title>${title.replaceAll('<', '&lt;')}</title><style>${fontFaces()}\n${STYLE}</style></head>` +
    `<body>${body}</body></html>`
  );
}

/** The number of pages in a PDF Chromium wrote (each page object is `/Type /Page`). */
export function pdfPageCount(bytes) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
}

/** Build the PDF; resolves to its page count. */
export async function buildGuidePdf(markdownFile, outFile) {
  const { chromium } = await import('@playwright/test');
  const channel = process.env.CG_PDF_CHANNEL ?? 'chrome';
  const browser = await chromium.launch(channel === 'bundled' ? {} : { channel });
  try {
    const page = await browser.newPage();
    await page.setContent(guideHtml(markdownFile), { waitUntil: 'load' });
    // `load()` answers with the faces it loaded for that text — an empty list means Vazirmatn is not
    // there for it. (`check()` would answer true for a family with no face at all.)
    const loaded = await page.evaluate(async () => {
      const faces = async (font, text) => (await document.fonts.load(font, text)).length;
      const counts = {
        persian: await faces("400 12px 'Vazirmatn'", 'نصب'),
        persianBold: await faces("700 12px 'Vazirmatn'", 'نصب'),
        latin: await faces("400 12px 'Vazirmatn'", 'Check'),
      };
      await document.fonts.ready;
      return counts;
    });
    if (Object.values(loaded).some((count) => count === 0)) {
      throw new Error(`Vazirmatn did not load (${JSON.stringify(loaded)}) - nothing was printed`);
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await page.pdf({
      path: outFile,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:7pt;color:#8793a3;font-family:sans-serif">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    return pdfPageCount(fs.readFileSync(outFile));
  } finally {
    await browser.close();
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const source = process.argv[2];
  const outAt = process.argv.indexOf('--out');
  const out = outAt < 0 ? undefined : process.argv[outAt + 1];
  if (source === undefined || out === undefined) {
    console.error('usage: node tools/release/src/build-guide.mjs <guide.md> --out <file.pdf>');
    process.exit(2);
  }
  try {
    const pages = await buildGuidePdf(path.resolve(source), path.resolve(out));
    process.stdout.write(`${path.resolve(out)}: ${String(pages)} pages\n`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
