import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontFaces } from './build-guide.mjs';

const COPY = {
  fa: {
    dir: 'rtl',
    heading: 'نسخه‌ها و تغییرات',
    description: 'تغییرات نسخه‌های',
    intro: 'قابلیت‌ها و رفع باگ‌های هر نسخه',
    features: 'قابلیت‌ها و بهبودها',
    fixes: 'رفع باگ‌ها',
    planned: 'در دست پیگیری',
    pagination: 'صفحه‌بندی نسخه‌ها',
    previous: 'صفحهٔ قبل',
    nextPage: 'صفحهٔ بعد',
    page: 'صفحه',
    of: 'از',
    status: { development: 'در حال توسعه', prepared: 'آمادهٔ تحویل', published: 'منتشرشده' },
  },
  en: {
    dir: 'ltr',
    heading: 'Versions and release notes',
    description: 'Release notes for',
    intro: 'Features and fixes for each version',
    features: 'Features and improvements',
    fixes: 'Bug fixes',
    planned: 'In progress',
    pagination: 'Release history pages',
    previous: 'Previous page',
    nextPage: 'Next page',
    page: 'Page',
    of: 'of',
    status: { development: 'In development', prepared: 'Ready for delivery', published: 'Published' },
  },
};

const PAGE_SIZE = 15;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function requiredText(value, at) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(at + ' must be a non-empty string');
  }
  return value.trim();
}

function stringList(value, at) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(at + ' must be an array of strings');
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function translation(value, at) {
  return {
    fa: requiredText(value?.fa, at + '.fa'),
    en: requiredText(value?.en, at + '.en'),
  };
}

function translationList(value, at) {
  if (!Array.isArray(value)) throw new Error(at + ' must be an array of translations');
  return value.map((item, index) => translation(item, at + '[' + String(index) + ']'));
}

function legacyTranslation(text) {
  return { fa: text, en: text };
}

export function releaseAssetNames(version) {
  return {
    guide: 'APASAI-CG-' + version + '-install-guide-fa.pdf',
    bridge: 'CG-Bridge_' + version + '_x64-setup.exe',
    control: 'CG-Control_' + version + '_x64-setup.exe',
    designer: 'CG-Designer_' + version + '_x64-setup.exe',
    sums: 'SHA256SUMS.txt',
  };
}

export function parseReleaseHistory(source) {
  const data = JSON.parse(source);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('release history must be an object');
  }
  const legacy = data.schemaVersion === 1;
  if (!legacy && data.schemaVersion !== 2) {
    throw new Error('release history schemaVersion must be 1 or 2');
  }
  const product = requiredText(data.product, 'product');
  if (!Array.isArray(data.releases) || data.releases.length === 0) {
    throw new Error('releases must contain at least one entry');
  }
  const seen = new Set();
  const releases = data.releases.map((raw, index) => {
    const at = 'releases[' + String(index) + ']';
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(at + ' must be an object');
    }
    const version = requiredText(raw.version, at + '.version');
    if (seen.has(version)) throw new Error('duplicate release version ' + version);
    seen.add(version);
    const status = requiredText(raw.status, at + '.status');
    if (!['development', 'prepared', 'published'].includes(status)) {
      throw new Error(at + '.status must be development, prepared or published');
    }
    return {
      version,
      title: legacy
        ? legacyTranslation(requiredText(raw.title, at + '.title'))
        : translation(raw.title, at + '.title'),
      date: requiredText(raw.date, at + '.date'),
      status,
      summary: legacy
        ? legacyTranslation(requiredText(raw.summary, at + '.summary'))
        : translation(raw.summary, at + '.summary'),
      features: legacy
        ? stringList(raw.changes, at + '.changes').map(legacyTranslation)
        : translationList(raw.features, at + '.features'),
      fixes: legacy ? [] : translationList(raw.fixes, at + '.fixes'),
      planned: raw.planned === undefined
        ? []
        : legacy
          ? stringList(raw.planned, at + '.planned').map(legacyTranslation)
          : translationList(raw.planned, at + '.planned'),
      downloadBaseUrl:
        typeof raw.downloadBaseUrl === 'string' && raw.downloadBaseUrl.trim() !== ''
          ? raw.downloadBaseUrl.trim().replace(/\/+$/u, '')
          : null,
    };
  });
  return { product, releases };
}

function list(title, items, className) {
  if (items.length === 0) return '';
  return (
    '<section class="' +
    className +
    '"><h3>' +
    escapeHtml(title) +
    '</h3><ul>' +
    items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') +
    '</ul></section>'
  );
}

function releaseCard(release, language, index) {
  const copy = COPY[language];
  const prefix = language === 'fa' ? 'version-' : 'en-version-';
  const version = 'v' + release.version;
  return (
    '<details class="release" id="' + prefix +
    escapeHtml(release.version) +
    '"' +
    (index === 0 ? ' open' : '') +
    (index >= PAGE_SIZE ? ' hidden' : '') +
    '><summary><span><bdi>' +
    escapeHtml(version) +
    '</bdi><strong>' +
    escapeHtml(release.title[language]) +
    '</strong></span><span class="meta"><time datetime="' +
    escapeHtml(release.date) +
    '">' +
    escapeHtml(release.date) +
    '</time><em data-status="' +
    escapeHtml(release.status) +
    '">' +
    escapeHtml(copy.status[release.status]) +
    '</em></span></summary><div class="release-body"><p class="summary">' +
    escapeHtml(release.summary[language]) +
    '</p>' +
    '<div class="change-groups">' +
    list(copy.features, release.features.map((item) => item[language]), 'features') +
    list(copy.fixes, release.fixes.map((item) => item[language]), 'fixes') +
    '</div>' +
    list(copy.planned, release.planned.map((item) => item[language]), 'planned') +
    '</div></details>'
  );
}

const STYLE = [
  ':root{color-scheme:dark;--bg:#071018;--panel:#0d1a24;--line:#244052;--text:#eef7fb;--muted:#9bb1bf;--accent:#36c5b7;--warm:#f4bd63}',
  '*{box-sizing:border-box}html{font-family:system-ui,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.8}[lang=fa]{font-family:Vazirmatn,Tahoma,Arial,sans-serif}',
  'body{margin:0;background:radial-gradient(circle at 85% 0,#123847 0,transparent 34rem),var(--bg)}',
  'main{width:min(1380px,calc(100% - 48px));margin:auto;padding:24px 0 48px}',
  'header{margin-bottom:22px}h1{font-size:clamp(1.35rem,2.2vw,1.8rem);line-height:1.3;margin:0 0 8px}header p{color:var(--muted);max-width:760px;margin:0}',
  '.languages{display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px}.languages button{font-size:.9rem;font-weight:700;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}.languages button[aria-pressed=true]{color:var(--text);border-color:var(--accent)}.languages button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}',
  '.release{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:18px;margin:14px 0;overflow:hidden;box-shadow:0 18px 50px #0005}',
  'summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;align-items:center;padding:22px 24px}summary::-webkit-details-marker{display:none}',
  'summary>span:first-child{display:flex;align-items:center;gap:14px}summary bdi{font:700 1rem ui-monospace,monospace;color:#061519;background:var(--accent);border-radius:999px;padding:5px 12px}',
  'summary strong{font-size:1.15rem}.meta{display:flex;align-items:center;gap:10px;color:var(--muted)}.meta em{font-style:normal;border:1px solid var(--line);border-radius:999px;padding:2px 10px}',
  '.meta em[data-status=development]{color:var(--warm)}.meta em[data-status=published]{color:var(--accent)}',
  '.release-body{border-top:1px solid var(--line);padding:22px 24px 28px}.summary{font-size:1.06rem;margin:0 0 18px}',
  'h3{font-size:1rem;margin:22px 0 8px;color:#d9f8f4}ul{margin:0;padding-inline-start:24px}li{margin:5px 0}.planned{color:var(--muted)}',
  '.change-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px}.change-groups section{background:#10212c;border:1px solid var(--line);border-radius:12px;padding:14px 16px}.change-groups h3{margin:0 0 8px}.features h3{color:#83e1d8}.fixes h3{color:var(--warm)}',
  '.pagination{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:24px;color:var(--muted)}.pagination button{font:inherit;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 14px;cursor:pointer}.pagination button:hover:enabled{border-color:var(--accent)}.pagination button:disabled{opacity:.45;cursor:default}.pagination button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
  '[hidden]{display:none!important}@media(max-width:680px){main{width:min(100% - 20px,1080px);padding-top:30px}summary{align-items:flex-start;flex-direction:column}.meta{width:100%;justify-content:space-between}.release-body{padding:18px}}',
].join('');

const LANGUAGE_PICKER = `
<nav class="languages" dir="ltr" aria-label="Language / زبان">
  <button type="button" data-language="fa" lang="fa" aria-controls="history-fa" aria-pressed="true">فارسی</button>
  <button type="button" data-language="en" lang="en" aria-controls="history-en" aria-pressed="false">English</button>
</nav>`;

const SWITCH_LANGUAGE = `
<script>
  const languageButtons = document.querySelectorAll('[data-language]');
  const languagePanels = document.querySelectorAll('[data-history-language]');
  for (const panel of languagePanels) {
    const cards = [...panel.querySelectorAll('.release')];
    const previous = panel.querySelector('[data-page-previous]');
    const next = panel.querySelector('[data-page-next]');
    const status = panel.querySelector('[data-page-status]');
    const count = Math.max(1, Math.ceil(cards.length / ${PAGE_SIZE}));
    const number = new Intl.NumberFormat(panel.lang);
    let page = 0;
    const showPage = (index) => {
      page = Math.max(0, Math.min(count - 1, index));
      cards.forEach((card, position) => {
        card.hidden = position < page * ${PAGE_SIZE} || position >= (page + 1) * ${PAGE_SIZE};
      });
      previous.disabled = page === 0;
      next.disabled = page === count - 1;
      status.textContent = status.dataset.pageLabel + ' ' + number.format(page + 1) + ' ' +
        status.dataset.ofLabel + ' ' + number.format(count);
    };
    for (const [button, offset] of [[previous, -1], [next, 1]]) {
      button.addEventListener('click', () => {
        showPage(page + offset);
        panel.scrollIntoView({ block: 'start' });
      });
    }
    showPage(0);
  }
  for (const button of languageButtons) {
    button.addEventListener('click', () => {
      const language = button.dataset.language;
      const selected = document.getElementById(button.getAttribute('aria-controls'));
      document.documentElement.lang = language;
      document.documentElement.dir = selected.dir;
      document.title = selected.dataset.title;
      for (const panel of languagePanels) panel.hidden = panel !== selected;
      for (const option of languageButtons) option.setAttribute('aria-pressed', String(option === button));
    });
  }
</script>`;

function languagePanel(data, language) {
  const copy = COPY[language];
  const title = copy.heading + ' · ' + data.product;
  const releases = data.releases.filter((release) => release.version !== 'next');
  const cards = releases
    .map((release, index) => releaseCard(release, language, index))
    .join('\n');
  const number = new Intl.NumberFormat(language);
  const pageCount = Math.max(1, Math.ceil(releases.length / PAGE_SIZE));
  return [
    '<section id="history-' + language + '" data-history-language lang="' + language +
      '" dir="' + copy.dir + '" data-title="' + escapeHtml(title) + '"' +
      (language === 'fa' ? '' : ' hidden') + '>',
    '<header><h1>' + escapeHtml(copy.heading) + '</h1><p><bdi>' +
      escapeHtml(data.product) + '</bdi> · ' + escapeHtml(copy.intro) + '</p></header>',
    cards,
    '<nav class="pagination" aria-label="' + escapeHtml(copy.pagination) + '">',
    '<button type="button" data-page-previous disabled>' + escapeHtml(copy.previous) + '</button>',
    '<span data-page-status data-page-label="' + escapeHtml(copy.page) + '" data-of-label="' +
      escapeHtml(copy.of) + '" aria-live="polite" aria-atomic="true">' + escapeHtml(copy.page) + ' ' +
      number.format(1) + ' ' + escapeHtml(copy.of) + ' ' + number.format(pageCount) + '</span>',
    '<button type="button" data-page-next' + (pageCount === 1 ? ' disabled' : '') + '>' +
      escapeHtml(copy.nextPage) + '</button></nav></section>',
  ].join('\n');
}

export function releaseHistoryHtml(data, options = {}) {
  const currentVersion = options.currentVersion;
  if (
    currentVersion !== undefined &&
    !data.releases.some((release) => release.version === currentVersion)
  ) {
    throw new Error(
      'release history has no entry for build version ' +
        currentVersion +
        '; add its changes before building installers',
    );
  }
  const license = fs.readFileSync(new URL('./vazirmatn-OFL.txt', import.meta.url), 'utf8');
  return [
    '<!doctype html>',
    '<html lang="fa" dir="rtl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="description" content="' + escapeHtml(COPY.fa.description + ' ' + data.product) + '">',
    '<title>' + escapeHtml(COPY.fa.heading + ' · ' + data.product) + '</title>',
    '<style>/*\n' + license + '\n*/\n' + fontFaces() + '\n' + STYLE + '</style></head><body><main>',
    LANGUAGE_PICKER,
    languagePanel(data, 'fa'),
    languagePanel(data, 'en'),
    '</main>',
    SWITCH_LANGUAGE,
    '</body></html>',
  ].join('\n');
}

export function buildReleaseHistory({ sourceFile, outFile, currentVersion }) {
  const data = parseReleaseHistory(fs.readFileSync(sourceFile, 'utf8'));
  const html = releaseHistoryHtml(data, { currentVersion });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return html;
}

const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const sourceAt = process.argv.indexOf('--source');
  const outAt = process.argv.indexOf('--out');
  const currentAt = process.argv.indexOf('--current-version');
  const sourceFile = sourceAt < 0 ? undefined : process.argv[sourceAt + 1];
  const outFile = outAt < 0 ? undefined : process.argv[outAt + 1];
  const currentVersion = currentAt < 0 ? undefined : process.argv[currentAt + 1];
  if (sourceFile === undefined || outFile === undefined) {
    console.error(
      'usage: node tools/release/src/build-release-history.mjs --source <history.json> --out <index.html> [--current-version <version>]',
    );
    process.exit(2);
  }
  try {
    const html = buildReleaseHistory({
      sourceFile: path.resolve(sourceFile),
      outFile: path.resolve(outFile),
      currentVersion,
    });
    process.stdout.write(path.resolve(outFile) + ': ' + String(Buffer.byteLength(html)) + ' bytes\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
