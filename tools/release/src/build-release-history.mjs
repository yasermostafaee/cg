import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontFaces } from './build-guide.mjs';

const COPY = {
  fa: {
    dir: 'rtl',
    heading: 'نسخه‌ها و تغییرات',
    description: 'تغییرات و دانلود نسخه‌های',
    intro: 'هر نسخه را باز کنید تا قابلیت‌ها، رفع باگ‌ها، راهنما و فایل‌های نصب آن را ببینید.',
    features: 'قابلیت‌ها و بهبودها',
    fixes: 'رفع باگ‌ها',
    planned: 'در دست پیگیری',
    next: 'بعدی',
    downloads: 'دانلودهای این نسخه',
    assets: ['راهنمای نصب', 'نصب CG Bridge', 'نصب CG Control', 'نصب CG Designer', 'Checksum'],
    unavailable: 'لینک بعداً متصل می‌شود',
    footer: 'فایل‌های هر نسخه پس از تعیین آدرس میزبان از همین صفحه در دسترس قرار می‌گیرند.',
    status: { development: 'در حال توسعه', prepared: 'آمادهٔ تحویل', published: 'منتشرشده' },
  },
  en: {
    dir: 'ltr',
    heading: 'Versions and release notes',
    description: 'Release notes and downloads for',
    intro: 'Open a version to see its features, bug fixes, installation guide and downloads.',
    features: 'Features and improvements',
    fixes: 'Bug fixes',
    planned: 'In progress',
    next: 'Next',
    downloads: 'Downloads for this version',
    assets: ['Installation guide (Persian)', 'CG Bridge setup', 'CG Control setup', 'CG Designer setup', 'Checksums'],
    unavailable: 'Download link pending',
    footer: 'Downloads become available here when the host address for the version is configured.',
    status: { development: 'In development', prepared: 'Ready for delivery', published: 'Published' },
  },
};

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

function downloadsFor(release, copy) {
  if (release.version === 'next') return '';
  const names = releaseAssetNames(release.version);
  const assets = [names.guide, names.bridge, names.control, names.designer, names.sums];
  const items = assets
    .map((file, index) => {
      const label = escapeHtml(copy.assets[index]);
      if (release.downloadBaseUrl === null) {
        return (
          '<span class="download disabled" aria-disabled="true" data-download-file="' +
          escapeHtml(file) +
          '"><strong>' +
          label +
          '</strong><small>' +
          escapeHtml(file) +
          '</small><em>' + escapeHtml(copy.unavailable) + '</em></span>'
        );
      }
      const href = release.downloadBaseUrl + '/' + encodeURIComponent(file);
      return (
        '<a class="download" href="' +
        escapeHtml(href) +
        '" download><strong>' +
        label +
        '</strong><small>' +
        escapeHtml(file) +
        '</small></a>'
      );
    })
    .join('');
  return '<section class="downloads"><h3>' + escapeHtml(copy.downloads) +
    '</h3><div class="download-grid">' + items + '</div></section>';
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

function releaseCard(release, language, open) {
  const copy = COPY[language];
  const prefix = language === 'fa' ? 'version-' : 'en-version-';
  const version = release.version === 'next' ? copy.next : 'v' + release.version;
  return (
    '<details class="release" id="' + prefix +
    escapeHtml(release.version) +
    '"' +
    (open ? ' open' : '') +
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
    downloadsFor(release, copy) +
    '</div></details>'
  );
}

const STYLE = [
  ':root{color-scheme:dark;--bg:#071018;--panel:#0d1a24;--line:#244052;--text:#eef7fb;--muted:#9bb1bf;--accent:#36c5b7;--warm:#f4bd63}',
  '*{box-sizing:border-box}html{font-family:system-ui,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.8}[lang=fa]{font-family:Vazirmatn,Tahoma,Arial,sans-serif}',
  'body{margin:0;background:radial-gradient(circle at 85% 0,#123847 0,transparent 34rem),var(--bg)}',
  'main{width:min(1080px,calc(100% - 32px));margin:auto;padding:56px 0 80px}',
  'header{margin-bottom:30px}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.2;margin:0 0 10px}header p{color:var(--muted);max-width:760px;margin:0}',
  '.languages{display:flex;justify-content:flex-end;gap:8px;margin-bottom:18px}.languages button{font-size:.9rem;font-weight:700;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}.languages button[aria-pressed=true]{color:var(--text);border-color:var(--accent)}.languages button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}',
  '.release{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:18px;margin:14px 0;overflow:hidden;box-shadow:0 18px 50px #0005}',
  'summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;align-items:center;padding:22px 24px}summary::-webkit-details-marker{display:none}',
  'summary>span:first-child{display:flex;align-items:center;gap:14px}summary bdi{font:700 1rem ui-monospace,monospace;color:#061519;background:var(--accent);border-radius:999px;padding:5px 12px}',
  'summary strong{font-size:1.15rem}.meta{display:flex;align-items:center;gap:10px;color:var(--muted)}.meta em{font-style:normal;border:1px solid var(--line);border-radius:999px;padding:2px 10px}',
  '.meta em[data-status=development]{color:var(--warm)}.meta em[data-status=published]{color:var(--accent)}',
  '.release-body{border-top:1px solid var(--line);padding:22px 24px 28px}.summary{font-size:1.06rem;margin:0 0 18px}',
  'h3{font-size:1rem;margin:22px 0 8px;color:#d9f8f4}ul{margin:0;padding-inline-start:24px}li{margin:5px 0}.planned{color:var(--muted)}',
  '.change-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px}.change-groups section{background:#10212c;border:1px solid var(--line);border-radius:12px;padding:14px 16px}.change-groups h3{margin:0 0 8px}.features h3{color:#83e1d8}.fixes h3{color:var(--warm)}',
  '.download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.download{display:flex;flex-direction:column;text-decoration:none;color:var(--text);background:#102632;border:1px solid #2d5869;border-radius:12px;padding:12px 14px;min-height:92px}',
  'a.download:hover{border-color:var(--accent);transform:translateY(-1px)}.download small{direction:ltr;text-align:left;color:var(--muted);overflow-wrap:anywhere}.download em{font-size:.78rem;color:var(--warm);font-style:normal;margin-top:auto}.disabled{opacity:.72}',
  'footer{color:var(--muted);margin-top:28px;font-size:.9rem}@media(max-width:680px){main{width:min(100% - 20px,1080px);padding-top:30px}summary{align-items:flex-start;flex-direction:column}.meta{width:100%;justify-content:space-between}.release-body{padding:18px}}',
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
  const cards = data.releases
    .map((release, index) => releaseCard(release, language, index === 0))
    .join('\n');
  return [
    '<section id="history-' + language + '" data-history-language lang="' + language +
      '" dir="' + copy.dir + '" data-title="' + escapeHtml(title) + '"' +
      (language === 'fa' ? '' : ' hidden') + '>',
    '<header><h1>' + escapeHtml(copy.heading) + '</h1><p><bdi>' +
      escapeHtml(data.product) + '</bdi> · ' + escapeHtml(copy.intro) + '</p></header>',
    cards,
    '<footer>' + escapeHtml(copy.footer) + '</footer></section>',
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
