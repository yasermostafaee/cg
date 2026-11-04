/**
 * Deterministic full-HD Quran slides for the folder Sequence starter.
 * Run from the repository root: node tools/generate-quran-slide-assets.mjs
 * The owner's screenshots are visual references only, never cropped/retouched.
 * Arabic verified at https://quran.com/fa/al-fatihah; Persian wording follows the
 * owner's supplied 3.png–5.png. See public/starters/assets/SOURCES.md.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../apps/designer/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const assetRoot = new URL('../apps/designer/public/starters/assets/', import.meta.url);
const amiri = await readFile(
  new URL('./quran-slide-source/AmiriQuran-Regular.ttf', import.meta.url),
);
const vazir = await readFile(
  new URL(
    '../apps/designer/public/fonts/vazirmatn/vazirmatn-arabic-500-normal.woff2',
    import.meta.url,
  ),
);

const slides = [
  { title: 'جزء اول', subtitle: 'قرآن کریم' },
  { title: 'سورهٔ مبارکهٔ فاتحه', subtitle: 'سورهٔ آغازین قرآن کریم' },
  {
    number: '۱',
    arabic: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    translation: 'به نام خداوند بخشنده مهربان',
  },
  {
    number: '۲',
    arabic: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ',
    translation: 'ستایش مخصوص خداوندی است که پروردگار جهانیان است.',
  },
  {
    number: '۳',
    arabic: 'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    translation: '(خداوندی که) بخشنده و بخشایشگر است (و رحمت عام و خاصش همگان را فرا گرفته).',
  },
];

const petals = Array.from(
  { length: 8 },
  (_, index) =>
    `<path transform="rotate(${index * 45})" d="M0 0 C-16-21-18-36 0-48 C18-36 16-21 0 0Z" fill="url(#gold)" stroke="#86622f" stroke-width="1.2"/>`,
).join('');
const rosette = (x, y, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${petals}<circle r="12" fill="#f8edcf" stroke="#956b31" stroke-width="2"/><circle r="5" fill="#7f2c29"/></g>`;
const leaves = Array.from({ length: 25 }, (_, index) => {
  const x = 228 + index * 61;
  return `<g transform="translate(${x} 89)"><path d="M-27 0 Q0-38 27 0 Q0 26-27 0" fill="none" stroke="#bb995d" stroke-width="1.3"/><path d="M-23 0 Q0 17 23 0" fill="none" stroke="#d8c29a"/>${index % 2 === 0 ? '<circle r="3" fill="#873c2d"/>' : ''}</g>`;
}).join('');
const ornament = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<defs>
 <linearGradient id="paper" x2="0" y2="1"><stop stop-color="#f6e9cc"/><stop offset=".5" stop-color="#fff9ea"/><stop offset="1" stop-color="#e8d2a7"/></linearGradient>
 <linearGradient id="gold"><stop stop-color="#755126"/><stop offset=".33" stop-color="#c8a660"/><stop offset=".53" stop-color="#f0dcaa"/><stop offset=".75" stop-color="#b68c48"/><stop offset="1" stop-color="#6e4b24"/></linearGradient>
 <pattern id="stars" width="112" height="112" patternUnits="userSpaceOnUse"><g fill="none" stroke="#a58750" stroke-width="1.3" opacity=".13"><path d="M56 4 70 28 98 14 84 42 108 56 84 70 98 98 70 84 56 108 42 84 14 98 28 70 4 56 28 42 14 14 42 28Z"/><path d="M56 25 87 56 56 87 25 56Z"/></g></pattern>
 <radialGradient id="center"><stop stop-color="#fffefa"/><stop offset="1" stop-color="#fffaf0"/></radialGradient>
</defs>
<path fill="url(#paper)" d="M0 0H1920V1080H0Z"/><path fill="url(#stars)" d="M0 0H1920V1080H0Z"/>
<rect x="46" y="40" width="1828" height="1000" rx="6" fill="none" stroke="#8e6c35" stroke-width="2"/>
<rect x="60" y="54" width="1800" height="972" rx="2" fill="none" stroke="#cbb27b"/>
<rect x="126" y="145" width="1668" height="820" rx="14" fill="url(#center)" stroke="url(#gold)" stroke-width="7"/>
<rect x="141" y="160" width="1638" height="790" rx="8" fill="none" stroke="#d6c090" stroke-width="1.5"/>
<path fill="url(#stars)" opacity=".22" d="M146 166H1774V944H146Z"/>
${leaves}<g transform="translate(0 986) scale(1 -1)">${leaves}</g>
${rosette(126, 145, 1.4)}${rosette(1794, 145, 1.4)}${rosette(126, 965, 1.4)}${rosette(1794, 965, 1.4)}
<path d="M835 145 Q865 145 880 125 Q900 95 927 111 Q948 79 960 61 Q972 79 993 111 Q1020 95 1040 125 Q1055 145 1085 145" fill="#fff8e8" stroke="url(#gold)" stroke-width="5"/>
${rosette(960, 125, 0.56)}
</svg>`;

function html(slide) {
  const body = slide.title
    ? `<main class="title"><div class="kicker">${slide.subtitle}</div><div class="medallion"><h1>${slide.title}</h1></div><div class="divider">✦</div></main>`
    : `<header><span>آیهٔ ${slide.number}</span><span>سورهٔ مبارکهٔ فاتحه</span></header><main class="verse"><div class="arabic" lang="ar" dir="rtl">${slide.arabic}<span class="verse-number">${slide.number}</span></div><div class="divider">✦</div><p class="translation" lang="fa" dir="rtl">${slide.translation}</p></main>`;
  return `<!doctype html><html lang="fa"><meta charset="utf-8"><style>
@font-face{font-family:AmiriQuran;src:url(data:font/ttf;base64,${amiri.toString('base64')})}
@font-face{font-family:Vazirmatn;src:url(data:font/woff2;base64,${vazir.toString('base64')})}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}body{font-family:Vazirmatn;color:#203b3a;background:#f4e6c6}.ornament{position:absolute;inset:0}header{position:absolute;left:208px;right:208px;top:200px;display:flex;justify-content:space-between;font-size:32px;color:#4a5a4c}main{position:absolute;left:208px;right:208px;top:262px;bottom:172px;text-align:center;display:flex;flex-direction:column;justify-content:center;align-items:center}.arabic{font-family:AmiriQuran;font-size:100px;line-height:2.5;color:#172f2b;white-space:nowrap;width:100%}.verse-number{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;width:64px;height:64px;border:2px solid #b19051;outline:1px solid #dcc494;outline-offset:5px;border-radius:50%;margin-right:32px;font:35px Vazirmatn;color:#826028}.translation{font-size:42px;line-height:2.1;color:#7b302f;max-width:1420px;margin:32px 0 0}.divider{display:flex;align-items:center;gap:24px;color:#ad8647;font-size:24px;margin-top:15px}.divider:before,.divider:after{content:'';width:175px;height:1px;background:linear-gradient(90deg,transparent,#b7975d)}.divider:after{transform:rotate(180deg)}.title{top:230px;bottom:182px;gap:45px}.kicker{font-size:36px;color:#7d6c4e}.medallion{position:relative;padding:72px 130px;border:2px solid #b99a5d;border-radius:50%;outline:1px solid #d9c597;outline-offset:14px;background:radial-gradient(ellipse,#fffef9,#fbf2dc);min-width:1100px}.medallion:before,.medallion:after{content:'◆';position:absolute;top:50%;transform:translateY(-50%);color:#a5783f;font-size:34px}.medallion:before{right:-20px}.medallion:after{left:-20px}h1{font-size:81px;font-weight:500;line-height:1.5;margin:0;color:#7c292b}
</style><div class="ornament">${ornament}</div>${body}</html>`;
}

const channel =
  process.env.PW_CHANNEL ?? (existsSync(chromium.executablePath()) ? undefined : 'chrome');
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  for (const [index, slide] of slides.entries()) {
    await page.setContent(html(slide), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const clipped = await page
      .locator('.arabic,.translation,h1')
      .evaluateAll((nodes) => nodes.some((node) => node.scrollWidth > node.clientWidth + 1));
    if (clipped) throw new Error(`Slide ${index + 1} has clipped text`);
    const path = fileURLToPath(
      new URL(`quran-wide-${String(index + 1).padStart(3, '0')}.png`, assetRoot),
    );
    await page.screenshot({ path });
    console.log(path);
  }
} finally {
  await browser.close();
}
