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
html { font-family: 'Vazirmatn', sans-serif; font-size: 9.9pt; line-height: 1.72; color: #141a23; }
body { margin: 0; }
h1 { font-size: 16pt; font-weight: 700; margin: 0 0 1mm; color: #0b2a44; }
h1 + p { margin: 0 0 3mm; color: #4a5566; }
h2 { font-size: 11.2pt; font-weight: 700; margin: 4mm 0 1.2mm; color: #0b2a44;
     border-bottom: 0.4mm solid #d9e2ec; padding-bottom: 0.6mm; break-after: avoid; }
h3 { break-after: avoid; }
p { margin: 0 0 1.9mm; }
ul, ol { margin: 0 0 2mm; padding-inline-start: 6mm; }
ol { list-style-type: persian; }
.figures { display: flex; gap: 3mm; align-items: flex-start; margin: 1.5mm 0 3mm; }
.figures figure { margin: 0; }
figure.side { float: left; margin: 0.6mm 4mm 2mm 0; }
h2 { clear: both; }
li { margin: 0 0 1mm; }
strong { font-weight: 700; }
bdi.ui { font-family: 'Vazirmatn', sans-serif; font-weight: 500; background: #eef2f7;
         border: 0.25mm solid #d3dbe6; border-radius: 1mm; padding: 0 1.2mm; white-space: nowrap; }
mark.confirm { background: #fff1c2; color: #5c4400; border-radius: 1mm; padding: 0 1mm;
               font-size: 8.4pt; white-space: nowrap; }
figure { margin: 1.5mm 0 3mm; break-inside: avoid; }
figure img { display: block; width: 100%; border: 0.3mm solid #c9d3df; border-radius: 1.2mm; }
figcaption { font-size: 8.2pt; color: #4a5566; margin-top: 0.8mm; }

.quick-guide {
  color: #203148;
  font-size: 11pt;
  line-height: 1.68;
}
.quick-guide > h1 {
  margin: 0;
  padding: 7mm 8mm 1mm;
  border-radius: 3mm 3mm 0 0;
  background: #102942;
  color: #fff;
  font-size: 25pt;
  line-height: 1.3;
}
.quick-guide > h1 + p {
  padding: 2mm 8mm 5mm;
  border-bottom: 1.15mm solid #1da8bd;
  border-radius: 0 0 3mm 3mm;
  background: #102942;
  color: #e3f4fb;
  font-size: 10pt;
}
.quick-guide > h1 + p .ui {
  margin-inline-end: 1mm;
  background: #234662;
  border-color: #52758d;
  color: #fff;
}
.quick-guide > h2 {
  margin: 6mm 0 3mm;
  padding: 2.4mm 3.2mm;
  border: 0;
  border-inline-start: 1.25mm solid #168496;
  background: #e7f2f6;
  color: #12334c;
  font-size: 17pt;
}
.quick-guide > h3 {
  margin: 4mm 0 1.1mm;
  color: #105b6a;
  font-size: 12pt;
}
.quick-guide p { margin-bottom: 2.6mm; }
.quick-guide li { margin-bottom: 1.65mm; break-inside: avoid; }
.quick-guide li::marker { color: #146d7b; font-weight: 700; }
.quick-guide .ui { border-color: #d9e4ec; background: #f1f6fa; }
.quick-guide figure { margin: 3mm auto 2mm; }
.quick-guide figure img { border-color: #c1d2df; }
.quick-guide figcaption { text-align: center; }
.quick-guide h3 + ul { margin-bottom: 2.6mm; }
@media print {
  .quick-guide > h2:nth-of-type(2) { break-before: page; margin-top: 0; }
}
`;

/** The whole page: RTL, Persian, the fonts and the pictures inlined. */
export function guideHtml(markdownFile) {
  const source = fs.readFileSync(markdownFile, 'utf8');
  const quickGuide = /^<!-- install-quick-guide -->\r?\n/;
  const markdown = source.replace(quickGuide, '');
  const dir = path.dirname(markdownFile);
  const body = markdownToHtml(markdown, (src) => {
    const file = path.resolve(dir, src);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
    if (mime === null) throw new Error(`the guide embeds ${src}, which is not a PNG or JPEG`);
    return dataUri(file, mime);
  });
  const title = /^#\s+(.*)$/m.exec(markdown)?.[1] ?? 'APASAI CG';
  const content = quickGuide.test(source) ? `<main class="quick-guide">${body}</main>` : body;
  return (
    `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">` +
    `<title>${title.replaceAll('<', '&lt;')}</title><style>${fontFaces()}\n${STYLE}</style></head>` +
    `<body>${content}</body></html>`
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
